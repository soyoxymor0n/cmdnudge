// Draws the app icon (1024 px) and the menu bar template icon. Run: swift tools/icons.swift
import AppKit

func png(_ size: Int, _ path: String, _ draw: (CGContext, CGFloat) -> Void) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw(NSGraphicsContext.current!.cgContext, CGFloat(size))
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

func glyph(_ s: String, size: CGFloat, weight: NSFont.Weight, color: NSColor, center: CGPoint) {
    let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color]
    let str = NSAttributedString(string: s, attributes: attrs)
    let b = str.size()
    str.draw(at: CGPoint(x: center.x - b.width / 2, y: center.y - b.height / 2))
}

let orange = NSColor(srgbRed: 1.0, green: 0.54, blue: 0.24, alpha: 1)
let blue = NSColor(srgbRed: 0.36, green: 0.55, blue: 1.0, alpha: 1)

png(1024, "src-tauri/icons/source-1024.png") { ctx, s in
    // macOS icon grid: 824 px body centred in 1024.
    let body = CGRect(x: 100, y: 100, width: 824, height: 824)
    let path = CGPath(roundedRect: body, cornerWidth: 186, cornerHeight: 186, transform: nil)
    ctx.addPath(path); ctx.clip()
    let bg = CGGradient(colorsSpace: nil, colors: [
        NSColor(srgbRed: 0.10, green: 0.11, blue: 0.20, alpha: 1).cgColor,
        NSColor(srgbRed: 0.03, green: 0.04, blue: 0.08, alpha: 1).cgColor] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(bg, start: CGPoint(x: 0, y: 924), end: CGPoint(x: 0, y: 100), options: [])
    // Glows: blue (the Windows habit) bottom-left, orange (the Mac nudge) top-right.
    for (c, p) in [(blue, CGPoint(x: 260, y: 260)), (orange, CGPoint(x: 780, y: 760))] {
        let g = CGGradient(colorsSpace: nil, colors: [c.withAlphaComponent(0.55).cgColor, c.withAlphaComponent(0).cgColor] as CFArray, locations: [0, 1])!
        ctx.drawRadialGradient(g, startCenter: p, startRadius: 0, endCenter: p, endRadius: 420, options: [])
    }
    // The keycap.
    let cap = CGRect(x: 262, y: 250, width: 500, height: 500)
    ctx.setShadow(offset: CGSize(width: 0, height: -26), blur: 50, color: NSColor.black.withAlphaComponent(0.55).cgColor)
    ctx.addPath(CGPath(roundedRect: cap, cornerWidth: 96, cornerHeight: 96, transform: nil))
    ctx.setFillColor(NSColor(srgbRed: 0.95, green: 0.95, blue: 0.97, alpha: 1).cgColor); ctx.fillPath()
    ctx.setShadow(offset: .zero, blur: 0, color: nil)
    let top = cap.insetBy(dx: 34, dy: 34).offsetBy(dx: 0, dy: 16)
    ctx.addPath(CGPath(roundedRect: top, cornerWidth: 70, cornerHeight: 70, transform: nil))
    ctx.setFillColor(NSColor.white.cgColor); ctx.fillPath()
    glyph("⌘", size: 300, weight: .medium, color: NSColor(srgbRed: 0.07, green: 0.08, blue: 0.13, alpha: 1), center: CGPoint(x: 512, y: 512))
    // The nudge: an orange dot, upper right of the cap.
    ctx.setFillColor(orange.cgColor)
    ctx.fillEllipse(in: CGRect(x: 690, y: 680, width: 120, height: 120))
    ctx.setStrokeColor(NSColor(srgbRed: 0.05, green: 0.06, blue: 0.11, alpha: 1).cgColor); ctx.setLineWidth(18)
    ctx.strokeEllipse(in: CGRect(x: 690, y: 680, width: 120, height: 120))
}

png(44, "src-tauri/icons/tray-template.png") { ctx, s in
    // 22 pt @2x. Black + alpha only; macOS tints it for light/dark menu bars.
    let cap = CGRect(x: 5, y: 5, width: 32, height: 32)
    ctx.addPath(CGPath(roundedRect: cap, cornerWidth: 8, cornerHeight: 8, transform: nil))
    ctx.setStrokeColor(NSColor.black.cgColor); ctx.setLineWidth(3.2); ctx.strokePath()
    glyph("⌘", size: 21, weight: .semibold, color: .black, center: CGPoint(x: 21, y: 21))
    ctx.setBlendMode(.clear)
    ctx.fillEllipse(in: CGRect(x: 27, y: 27, width: 17, height: 17))
    ctx.setBlendMode(.normal)
    ctx.setFillColor(NSColor.black.cgColor)
    ctx.fillEllipse(in: CGRect(x: 31, y: 31, width: 11, height: 11))
}
print("icons drawn")
