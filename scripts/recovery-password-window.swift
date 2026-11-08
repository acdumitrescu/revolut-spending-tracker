import AppKit
import Foundation

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let menu = NSMenu()
let edit = NSMenuItem()
let editMenu = NSMenu(title: "Edit")
editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
edit.submenu = editMenu
menu.addItem(edit)
app.mainMenu = menu
let creating = CommandLine.arguments.dropFirst().first == "create"
app.activate(ignoringOtherApps: true)
while true {
    let alert = NSAlert()
    alert.messageText = creating ? "Protect your SSB recovery copy" : "Unlock your SSB recovery copy"
    alert.informativeText = creating
        ? "Choose a unique password (at least 16 characters) and save it in Apple Passwords. Type it twice below. This protects a recovery copy; your usual app unlock stays the same.\n\nNo password or database key is sent to chat."
        : "Enter your recovery password. A copy of the encrypted backup will be checked without using Keychain or changing your live data."
    let view = NSView(frame: NSRect(x: 0, y: 0, width: 420, height: creating ? 88 : 34))
    let first = NSSecureTextField(frame: NSRect(x: 0, y: creating ? 54 : 4, width: 420, height: 28))
    first.placeholderString = "Recovery password"
    view.addSubview(first)
    let second = NSSecureTextField(frame: NSRect(x: 0, y: 4, width: 420, height: 28))
    second.placeholderString = "Type the same password again"
    if creating { view.addSubview(second); first.nextKeyView = second }
    alert.accessoryView = view
    alert.addButton(withTitle: creating ? "Create recovery copy" : "Verify recovery copy")
    alert.addButton(withTitle: "Cancel")
    alert.window.initialFirstResponder = first
    guard alert.runModal() == .alertFirstButtonReturn else { exit(2) }
    let password = first.stringValue
    let confirmation = second.stringValue
    first.stringValue = ""
    second.stringValue = ""
    if password.utf8.count >= 16 && password.utf8.count <= 256 && (!creating || password == confirmation) {
        FileHandle.standardOutput.write(Data(password.utf8))
        exit(0)
    }
    let error = NSAlert()
    error.messageText = "Please try again"
    error.informativeText = "Use at least 16 characters (at most 256 UTF-8 bytes). Both password fields must match exactly."
    error.runModal()
}
