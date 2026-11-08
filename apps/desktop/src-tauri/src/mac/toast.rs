//! The toast: a native, non-activating NSPanel. It never becomes key and never activates
//! cmdnudge, so the shortcut you try next goes to your app (invariant 4). It ignores the mouse
//! unless the pointer is on it: then a habit hint holds still and offers "Keep" (#29). When the
//! evidence says a shortcut is used on purpose, the hint asks right away (#31): same toast, a
//! question in the detail line and the buttons under it.

use crate::engine::{KeepOffer, ToastSpec, ToastStyle};
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAnimatablePropertyContainer, NSBackingStoreType, NSBezelStyle, NSButton, NSColor, NSControl, NSControlSize,
    NSEvent, NSFont, NSPanel, NSResponder, NSScreen, NSTextField, NSView, NSVisualEffectBlendingMode,
    NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_foundation::{NSObject, NSPoint, NSRect, NSSize, NSString};
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

struct Toast {
    panel: Retained<NSPanel>,
    from: Retained<NSTextField>,
    arrow: Retained<NSTextField>,
    to: Retained<NSTextField>,
    detail: Retained<NSTextField>,
    keep_here: Retained<ToastButton>,
    keep_all: Retained<ToastButton>,
    not_now: Retained<ToastButton>,
    _target: Retained<KeepTarget>,
    shown: Option<ToastSpec>,
    /// The Keep buttons are showing (the pointer reached a habit hint).
    offering: bool,
}

define_class!(
    // A button that takes the first click although cmdnudge is never the active app.
    #[unsafe(super(NSButton, NSControl, NSView, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "CmdnudgeToastButton"]
    struct ToastButton;

    impl ToastButton {
        #[unsafe(method(acceptsFirstMouse:))]
        fn accepts_first_mouse(&self, _event: Option<&NSEvent>) -> bool {
            true
        }
    }
);

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "CmdnudgeKeepTarget"]
    struct KeepTarget;

    impl KeepTarget {
        #[unsafe(method(keepHere:))]
        fn keep_here(&self, _sender: Option<&AnyObject>) {
            kept_main(false);
        }

        #[unsafe(method(keepEverywhere:))]
        fn keep_everywhere(&self, _sender: Option<&AnyObject>) {
            kept_main(true);
        }

        #[unsafe(method(notNow:))]
        fn not_now(&self, _sender: Option<&AnyObject>) {
            HOVERED.store(false, Ordering::SeqCst);
            hide_after(0);
        }
    }
);

thread_local! {
    static TOAST: RefCell<Option<Toast>> = const { RefCell::new(None) };
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static POSITION: Mutex<String> = Mutex::new(String::new());
/// The pointer is on the toast: it stays until the pointer leaves.
static HOVERED: AtomicBool = AtomicBool::new(false);
static ON_KEEP: OnceLock<Box<dyn Fn(KeepOffer, bool) + Send + Sync>> = OnceLock::new();

pub fn init(app: AppHandle) {
    let _ = APP.set(app);
}

/// What a click on "Keep" does (#29): set once by the app.
pub fn on_keep(f: impl Fn(KeepOffer, bool) + Send + Sync + 'static) {
    let _ = ON_KEEP.set(Box::new(f));
}

pub fn set_position(p: &str) {
    *POSITION.lock().unwrap() = p.to_string();
}

/// Show a toast from any thread. A new toast replaces the current one; the same toast
/// again just extends its time on screen (no stacking).
pub fn show(spec: ToastSpec) {
    let Some(app) = APP.get() else { return };
    let duration = spec.duration_ms;
    let _ = app.run_on_main_thread(move || show_main(spec));
    hide_after(duration);
}

/// Fades the toast out after `ms`, unless a newer toast came or the pointer is on it. While it
/// is up, the pointer is watched (cheap: one location read every 80 ms).
fn hide_after(ms: u64) {
    let Some(app) = APP.get() else { return };
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        let start = std::time::Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(80));
            if GENERATION.load(Ordering::SeqCst) != generation {
                return;
            }
            let _ = app.run_on_main_thread(track_pointer_main);
            if start.elapsed() >= Duration::from_millis(ms) && !HOVERED.load(Ordering::SeqCst) {
                break;
            }
        }
        if GENERATION.load(Ordering::SeqCst) != generation {
            return;
        }
        let _ = app.run_on_main_thread(move || {
            if GENERATION.load(Ordering::SeqCst) == generation {
                fade_out_main();
            }
        });
        std::thread::sleep(Duration::from_millis(350));
        let _ = app.run_on_main_thread(move || {
            if GENERATION.load(Ordering::SeqCst) == generation {
                TOAST.with(|t| {
                    if let Some(t) = t.borrow_mut().as_mut() {
                        t.panel.orderOut(None);
                        t.panel.setIgnoresMouseEvents(true);
                        t.shown = None;
                        HOVERED.store(false, Ordering::SeqCst);
                    }
                });
            }
        });
    });
}

fn label(mtm: MainThreadMarker) -> Retained<NSTextField> {
    let l = NSTextField::labelWithString(&NSString::from_str(""), mtm);
    l.setSelectable(false);
    l
}

fn button(mtm: MainThreadMarker, title: &str, target: &KeepTarget, action: objc2::runtime::Sel) -> Retained<ToastButton> {
    let b: Retained<ToastButton> =
        unsafe { msg_send![ToastButton::alloc(mtm), initWithFrame: NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(10.0, 10.0))] };
    b.setTitle(&NSString::from_str(title));
    b.setBezelStyle(NSBezelStyle::Push);
    b.setControlSize(NSControlSize::Small);
    b.setFont(Some(&NSFont::systemFontOfSize(11.0)));
    unsafe {
        b.setTarget(Some(target));
        b.setAction(Some(action));
    }
    b.setHidden(true);
    b
}

/// Called every 80 ms while a toast is up: is the pointer on it?
fn track_pointer_main() {
    TOAST.with(|cell| {
        let mut cell = cell.borrow_mut();
        let Some(t) = cell.as_mut() else { return };
        if t.shown.is_none() || !t.panel.isVisible() {
            return;
        }
        let p = NSEvent::mouseLocation();
        let f = t.panel.frame();
        let inside = p.x >= f.origin.x && p.x <= f.origin.x + f.size.width && p.y >= f.origin.y && p.y <= f.origin.y + f.size.height;
        HOVERED.store(inside, Ordering::SeqCst);
        t.panel.setIgnoresMouseEvents(!inside);
        if inside {
            t.panel.setAlphaValue(1.0);
            if !t.offering && t.shown.as_ref().is_some_and(|s| s.keep.is_some()) {
                t.offering = true;
                layout(t);
            }
        }
    });
}

/// A Keep button was clicked.
fn kept_main(everywhere: bool) {
    let offer = TOAST.with(|cell| {
        let mut cell = cell.borrow_mut();
        let t = cell.as_mut()?;
        let offer = t.shown.as_ref()?.keep.clone()?;
        let mut done = t.shown.clone()?;
        done.detail = if everywhere { "Kept everywhere · undo in Settings".into() } else { format!("Kept in {} · undo in Settings", offer.app_name) };
        done.keep = None;
        t.detail.setStringValue(&NSString::from_str(&done.detail));
        t.detail.sizeToFit();
        t.shown = Some(done);
        t.offering = false;
        layout(t);
        Some(offer)
    });
    if let (Some(offer), Some(f)) = (offer, ON_KEEP.get()) {
        f(offer, everywhere);
    }
    HOVERED.store(false, Ordering::SeqCst);
    hide_after(1400);
}

fn build(mtm: MainThreadMarker) -> Toast {
    let rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(320.0, 64.0));
    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        NSPanel::alloc(mtm),
        rect,
        NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel,
        NSBackingStoreType::Buffered,
        false,
    );
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setFloatingPanel(true);
    panel.setBecomesKeyOnlyIfNeeded(true);
    panel.setHidesOnDeactivate(false);
    panel.setLevel(25); // NSStatusWindowLevel: above normal and floating windows
    panel.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    panel.setIgnoresMouseEvents(true);
    panel.setOpaque(false);
    panel.setBackgroundColor(Some(&NSColor::clearColor()));
    panel.setHasShadow(true);

    let effect = NSVisualEffectView::initWithFrame(NSVisualEffectView::alloc(mtm), rect);
    effect.setMaterial(NSVisualEffectMaterial::Popover);
    effect.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    effect.setState(NSVisualEffectState::Active);
    effect.setWantsLayer(true);
    unsafe {
        let layer: Option<Retained<AnyObject>> = msg_send![&*effect, layer];
        if let Some(layer) = layer {
            let _: () = msg_send![&*layer, setCornerRadius: 14.0f64];
            let _: () = msg_send![&*layer, setMasksToBounds: true];
        }
    }
    panel.setContentView(Some(&effect));

    let from = label(mtm);
    let arrow = label(mtm);
    let to = label(mtm);
    let detail = label(mtm);
    arrow.setStringValue(&NSString::from_str("→"));
    for l in [&from, &arrow, &to, &detail] {
        effect.addSubview(l);
    }
    let target: Retained<KeepTarget> = unsafe { msg_send![KeepTarget::alloc(mtm), init] };
    let keep_here = button(mtm, "Keep here", &target, sel!(keepHere:));
    let keep_all = button(mtm, "Keep everywhere", &target, sel!(keepEverywhere:));
    effect.addSubview(&keep_here);
    let not_now = button(mtm, "Not now", &target, sel!(notNow:));
    effect.addSubview(&keep_all);
    effect.addSubview(&not_now);
    Toast { panel, from, arrow, to, detail, keep_here, keep_all, not_now, _target: target, shown: None, offering: false }
}

fn show_main(spec: ToastSpec) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    TOAST.with(|cell| {
        let mut cell = cell.borrow_mut();
        let t = cell.get_or_insert_with(|| build(mtm));
        let already = t.shown.as_ref() == Some(&spec);
        t.shown = Some(spec.clone());
        if already {
            t.panel.setAlphaValue(1.0);
            return;
        }
        t.offering = spec.keep.as_ref().is_some_and(|k| k.ask);

        let quiet = spec.style == ToastStyle::Quiet;
        let guard = spec.style == ToastStyle::Guard;
        let big = if quiet { 15.0 } else { 19.0 };
        let small = if quiet { 12.0 } else { 13.0 };
        t.from.setStringValue(&NSString::from_str(&spec.from));
        t.to.setStringValue(&NSString::from_str(&spec.to));
        t.detail.setStringValue(&NSString::from_str(&spec.detail));
        if guard {
            t.from.setFont(Some(&NSFont::systemFontOfSize_weight(big - 2.0, 0.4)));
            t.from.setTextColor(Some(&NSColor::systemRedColor()));
            t.to.setFont(Some(&NSFont::systemFontOfSize_weight(small + 1.0, 0.0)));
            t.to.setTextColor(Some(&NSColor::secondaryLabelColor()));
            t.detail.setFont(Some(&NSFont::systemFontOfSize_weight(15.0, 0.3)));
            t.detail.setTextColor(Some(&NSColor::labelColor()));
            t.arrow.setStringValue(&NSString::from_str("·"));
        } else {
            t.from.setFont(Some(&NSFont::systemFontOfSize_weight(big - 3.0, 0.23)));
            t.from.setTextColor(Some(&NSColor::secondaryLabelColor()));
            t.to.setFont(Some(&NSFont::systemFontOfSize_weight(big, 0.4)));
            t.to.setTextColor(Some(&NSColor::labelColor()));
            t.detail.setFont(Some(&NSFont::systemFontOfSize_weight(small, 0.0)));
            t.detail.setTextColor(Some(&NSColor::secondaryLabelColor()));
            t.arrow.setStringValue(&NSString::from_str(if spec.style == ToastStyle::Tip { "·" } else { "→" }));
        }
        t.arrow.setFont(Some(&NSFont::systemFontOfSize_weight(big - 3.0, 0.0)));
        t.arrow.setTextColor(Some(&NSColor::tertiaryLabelColor()));
        for l in [&t.from, &t.arrow, &t.to, &t.detail] {
            l.sizeToFit();
        }
        if let Some(k) = &spec.keep {
            t.keep_here.setTitle(&NSString::from_str(&format!("Keep in {}", k.app_name)));
        }
        layout(t);
    });
}

/// Places the labels (and the Keep buttons while offered) and moves the panel into its corner.
fn layout(t: &mut Toast) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let offering = t.offering;
    // #31: a question keeps its detail line, with the buttons (and "Not now") under it.
    let asking = offering && t.shown.as_ref().and_then(|s| s.keep.as_ref()).is_some_and(|k| k.ask);
    t.detail.setHidden(offering && !asking);
    t.keep_here.setHidden(!offering);
    t.keep_all.setHidden(!offering);
    t.not_now.setHidden(!asking);
    if offering {
        t.keep_here.sizeToFit();
        t.keep_all.sizeToFit();
        t.not_now.sizeToFit();
    }
    {
        // Layout: row 1 = from → to (baseline-ish aligned), row 2 = detail.
        let (pad_x, pad_y, gap) = (16.0, 11.0, 8.0);
        let fs = t.from.frame().size;
        let as_ = t.arrow.frame().size;
        let ts = t.to.frame().size;
        let buttons = {
            let (a, b, c) = (t.keep_here.frame().size, t.keep_all.frame().size, t.not_now.frame().size);
            let w = a.width + 6.0 + b.width + if asking { 6.0 + c.width } else { 0.0 };
            NSSize::new(w, a.height.max(b.height))
        };
        let dsz = t.detail.frame().size;
        let ds = if asking {
            NSSize::new(dsz.width.max(buttons.width), dsz.height + 6.0 + buttons.height)
        } else if offering {
            buttons
        } else {
            dsz
        };
        let row1_h = fs.height.max(ts.height);
        let row1_w = fs.width + gap + as_.width + gap + ts.width;
        let w = (row1_w.max(ds.width) + pad_x * 2.0).max(180.0).ceil();
        let h = (pad_y * 2.0 + row1_h + 2.0 + ds.height).ceil();
        let y1 = h - pad_y - row1_h;
        let mut x = pad_x;
        t.from.setFrameOrigin(NSPoint::new(x, y1 + (row1_h - fs.height) / 2.0));
        x += fs.width + gap;
        t.arrow.setFrameOrigin(NSPoint::new(x, y1 + (row1_h - as_.height) / 2.0));
        x += as_.width + gap;
        t.to.setFrameOrigin(NSPoint::new(x, y1 + (row1_h - ts.height) / 2.0));
        let detail_y = if asking { pad_y + buttons.height + 6.0 } else { pad_y };
        t.detail.setFrameOrigin(NSPoint::new(pad_x, detail_y));
        if offering {
            let (a, b) = (t.keep_here.frame().size, t.keep_all.frame().size);
            t.keep_here.setFrameOrigin(NSPoint::new(pad_x - 6.0, pad_y - 4.0));
            t.keep_all.setFrameOrigin(NSPoint::new(pad_x - 6.0 + a.width + 6.0, pad_y - 4.0));
            t.not_now.setFrameOrigin(NSPoint::new(pad_x - 6.0 + a.width + 6.0 + b.width + 6.0, pad_y - 4.0));
        }

        let screen = NSScreen::mainScreen(mtm);
        let vf = screen.map(|s| s.visibleFrame()).unwrap_or(NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1440.0, 900.0)));
        let margin = 16.0;
        let pos = POSITION.lock().unwrap().clone();
        let (fx, fy, slide) = match pos.as_str() {
            "bottom-left" => (vf.origin.x + margin, vf.origin.y + margin, -8.0),
            "top-center" => (vf.origin.x + (vf.size.width - w) / 2.0, vf.origin.y + vf.size.height - h - margin, 8.0),
            _ => (vf.origin.x + vf.size.width - w - margin, vf.origin.y + margin, -8.0),
        };
        let target = NSRect::new(NSPoint::new(fx, fy), NSSize::new(w, h));
        let reduce = super::context::reduce_motion();
        let visible = t.panel.isVisible() && t.panel.alphaValue() > 0.5;
        if visible || reduce {
            t.panel.setFrame_display(target, true);
            t.panel.orderFrontRegardless();
            t.panel.animator().setAlphaValue(1.0);
        } else {
            let start = NSRect::new(NSPoint::new(fx, fy + slide), NSSize::new(w, h));
            t.panel.setAlphaValue(0.0);
            t.panel.setFrame_display(start, true);
            t.panel.orderFrontRegardless();
            let a = t.panel.animator();
            a.setAlphaValue(1.0);
            a.setFrame_display(target, true);
        }
        t.panel.invalidateShadow();
    }
}

fn fade_out_main() {
    TOAST.with(|t| {
        if let Some(t) = t.borrow().as_ref() {
            t.panel.animator().setAlphaValue(0.0);
        }
    });
}
