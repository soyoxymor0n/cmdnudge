//! The toast: a native, non-activating NSPanel. It never becomes key, never activates
//! cmdnudge and ignores the mouse, so the shortcut you try next goes to your app (invariant 4).

use crate::engine::{ToastSpec, ToastStyle};
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{msg_send, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAnimatablePropertyContainer, NSBackingStoreType, NSColor, NSFont, NSPanel, NSScreen, NSTextField,
    NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView,
    NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use std::cell::RefCell;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

struct Toast {
    panel: Retained<NSPanel>,
    from: Retained<NSTextField>,
    arrow: Retained<NSTextField>,
    to: Retained<NSTextField>,
    detail: Retained<NSTextField>,
    shown: Option<ToastSpec>,
}

thread_local! {
    static TOAST: RefCell<Option<Toast>> = const { RefCell::new(None) };
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static POSITION: Mutex<String> = Mutex::new(String::new());

pub fn init(app: AppHandle) {
    let _ = APP.set(app);
}

pub fn set_position(p: &str) {
    *POSITION.lock().unwrap() = p.to_string();
}

/// Show a toast from any thread. A new toast replaces the current one; the same toast
/// again just extends its time on screen (no stacking).
pub fn show(spec: ToastSpec) {
    let Some(app) = APP.get() else { return };
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let duration = spec.duration_ms;
    let _ = app.run_on_main_thread(move || show_main(spec));
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(duration));
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
                        t.shown = None;
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
    Toast { panel, from, arrow, to, detail, shown: None }
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
            t.arrow.setStringValue(&NSString::from_str("→"));
        }
        t.arrow.setFont(Some(&NSFont::systemFontOfSize_weight(big - 3.0, 0.0)));
        t.arrow.setTextColor(Some(&NSColor::tertiaryLabelColor()));
        for l in [&t.from, &t.arrow, &t.to, &t.detail] {
            l.sizeToFit();
        }

        // Layout: row 1 = from → to (baseline-ish aligned), row 2 = detail.
        let (pad_x, pad_y, gap) = (16.0, 11.0, 8.0);
        let fs = t.from.frame().size;
        let as_ = t.arrow.frame().size;
        let ts = t.to.frame().size;
        let ds = t.detail.frame().size;
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
        t.detail.setFrameOrigin(NSPoint::new(pad_x, pad_y));

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
    });
}

fn fade_out_main() {
    TOAST.with(|t| {
        if let Some(t) = t.borrow().as_ref() {
            t.panel.animator().setAlphaValue(0.0);
        }
    });
}
