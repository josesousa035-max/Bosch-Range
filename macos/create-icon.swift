import Cocoa

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let image = NSImage(size: NSSize(width: pixels, height: pixels), flipped: false) { rect in
            let side = rect.width
            NSColor(calibratedRed: 0, green: 0.357, blue: 0.608, alpha: 1).setFill()
            NSBezierPath(roundedRect: rect.insetBy(dx: side * 0.05, dy: side * 0.05), xRadius: side * 0.2, yRadius: side * 0.2).fill()
            let bolt = NSBezierPath()
            let vertices: [(CGFloat, CGFloat)] = [(0.57,0.88),(0.26,0.43),(0.49,0.43),(0.43,0.12),(0.75,0.60),(0.52,0.60)]
            bolt.move(to: NSPoint(x: vertices[0].0 * side, y: vertices[0].1 * side))
            for point in vertices.dropFirst() { bolt.line(to: NSPoint(x: point.0 * side, y: point.1 * side)) }
            bolt.close()
            NSColor.white.setFill()
            bolt.fill()
            NSColor(calibratedRed: 0.93, green: 0.2, blue: 0.27, alpha: 1).setFill()
            NSBezierPath(ovalIn: NSRect(x: side * 0.75, y: side * 0.74, width: side * 0.12, height: side * 0.12)).fill()
            return true
        }
        guard let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:]) else {
            fatalError("Não foi possível criar o ícone")
        }
        let suffix = scale == 2 ? "@2x" : ""
        try png.write(to: directory.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
    }
}
