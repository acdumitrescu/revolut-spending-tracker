// Secrets travel only over private stdin/stdout pipes, never argv or files.
import AppKit
import Foundation

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let menu = NSMenu()
let edit = NSMenuItem()
let editMenu = NSMenu(title: "Edit")
editMenu.addItem(withTitle: "Paste", action: Selector(("paste:")), keyEquivalent: "v")
editMenu.addItem(withTitle: "Select All", action: Selector(("selectAll:")), keyEquivalent: "a")
edit.submenu = editMenu
menu.addItem(edit)
app.mainMenu = menu
let input = FileHandle.standardInput.readData(ofLength: 128)
guard let secret = String(data: input, encoding: .utf8), secret.hasPrefix("SSB1-"), secret.count == 78 else { exit(1) }
let clipboard = NSPasteboard.general
var copiedChange: Int? = nil
func clearOwnClipboard() {
    if let change = copiedChange, clipboard.changeCount == change { clipboard.clearContents() }
    copiedChange = nil
}
let intro = NSAlert()
intro.messageText = "Save your SSB recovery key"
intro.informativeText = "In Apple Passwords, add a private entry:\nWebsite: ssb-recovery.invalid\nUsername: local-personal-v1\nPassword: paste the recovery key.\n\nThe next button copies the key for two minutes. Save the entry, then return here. Keep it out of shared groups."
intro.addButton(withTitle: "Copy key and open Passwords")
intro.addButton(withTitle: "Cancel")
app.activate(ignoringOtherApps: true)
guard intro.runModal() == .alertFirstButtonReturn else { exit(2) }
clipboard.clearContents()
let item = NSPasteboardItem()
item.setString(secret, forType: .string)
item.setString("", forType: NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"))
item.setString("", forType: NSPasteboard.PasteboardType("org.nspasteboard.TransientType"))
clipboard.writeObjects([item])
copiedChange = clipboard.changeCount
let timer = Timer(timeInterval: 120, repeats: false) { _ in clearOwnClipboard() }
RunLoop.main.add(timer, forMode: .common)
RunLoop.main.add(timer, forMode: .modalPanel)
NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/Passwords.app"))
let saved = NSAlert()
saved.messageText = "Save the entry in Apple Passwords"
saved.informativeText = "Paste into the Password field and save it. Then return here and continue. The clipboard will be cleared before verification; you will need to copy the saved password from Apple Passwords."
saved.addButton(withTitle: "Saved — continue")
saved.addButton(withTitle: "Cancel")
let result = saved.runModal()
timer.invalidate()
clearOwnClipboard()
guard result == .alertFirstButtonReturn else { exit(2) }
let verify = NSAlert()
verify.messageText = "Verify the saved recovery key"
verify.informativeText = "Copy the password from your saved ssb-recovery.invalid entry, then paste it below. This will test an encrypted backup without changing your live data."
let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 420, height: 28))
verify.accessoryView = field
verify.addButton(withTitle: "Verify backup")
verify.addButton(withTitle: "Cancel")
verify.window.initialFirstResponder = field
let verified = verify.runModal()
// Only clear a clipboard containing this exact key; preserve unrelated copies.
if clipboard.string(forType: .string) == secret { clipboard.clearContents() }
guard verified == .alertFirstButtonReturn else { exit(2) }
let supplied = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
field.stringValue = ""
guard supplied == secret else {
    let error = NSAlert()
    error.messageText = "The saved key did not match"
    error.informativeText = "No recovery verification was recorded. Run the setup again."
    error.runModal()
    exit(1)
}
FileHandle.standardOutput.write(Data(supplied.utf8))
