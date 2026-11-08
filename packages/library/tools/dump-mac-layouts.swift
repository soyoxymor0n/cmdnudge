import Carbon
import Foundation
let props = [kTISPropertyInputSourceType as String: kTISTypeKeyboardLayout as String] as CFDictionary
let list = TISCreateInputSourceList(props, true).takeRetainedValue() as! [TISInputSource]
func str(_ s: TISInputSource, _ k: CFString) -> String? {
  guard let p = TISGetInputSourceProperty(s, k) else { return nil }
  return Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
}
let want = CommandLine.arguments.dropFirst()
var out: [String: [String: [String]]] = [:]
let kbd = UInt32(LMGetKbdType())
for s in list {
  guard let id = str(s, kTISPropertyInputSourceID), want.isEmpty || want.contains(where: { id == "com.apple.keylayout." + $0 }) else { continue }
  guard let p = TISGetInputSourceProperty(s, kTISPropertyUnicodeKeyLayoutData) else { continue }
  let data = Unmanaged<CFData>.fromOpaque(p).takeUnretainedValue() as Data
  var keys: [String: [String]] = [:]
  data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
    let layout = raw.baseAddress!.assumingMemoryBound(to: UCKeyboardLayout.self)
    for code in 0..<51 {
      var row: [String] = []
      for mods in [0, shiftKey, optionKey, shiftKey | optionKey] {
        var dead: UInt32 = 0; var len = 0; var chars = [UniChar](repeating: 0, count: 4)
        UCKeyTranslate(layout, UInt16(code), UInt16(kUCKeyActionDown), UInt32((mods >> 8) & 0xFF), kbd, OptionBits(kUCKeyTranslateNoDeadKeysMask), &dead, 4, &len, &chars)
        row.append(String(utf16CodeUnits: chars, count: len))
      }
      keys[String(code)] = row
    }
  }
  out[id] = keys
}
print(String(data: try! JSONSerialization.data(withJSONObject: out, options: [.sortedKeys]), encoding: .utf8)!)
