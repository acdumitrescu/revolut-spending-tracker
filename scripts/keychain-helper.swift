// Application-local helper; never accepts a secret in argv or environment.
// Key retrieval is binary stdout for the parent process, never a user log.
import Foundation
import Security

let service = "SimpleSafeBanking.encrypted-storage.v1"
let account = "local-personal-v1"
func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
let action = CommandLine.arguments.count == 2 ? CommandLine.arguments[1] : ""
let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                          kSecAttrService as String: service,
                          kSecAttrAccount as String: account]
switch action {
case "read":
    var lookup = query
    lookup[kSecReturnData as String] = true
    lookup[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(lookup as CFDictionary, &result) == errSecSuccess,
          let key = result as? Data, key.count == 32 else {
        fail("Database key unavailable. Unlock Keychain or restore the recovery key; no fallback is allowed.")
    }
    FileHandle.standardOutput.write(key)
case "create", "restore":
    var key: Data
    if action == "restore" {
        // Bounded input: refuse more or fewer than 32 raw bytes.
        key = FileHandle.standardInput.readData(ofLength: 33)
        guard key.count == 32 else { fail("Recovery key must contain exactly 32 bytes.") }
    } else {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { fail("Unable to generate database key.") }
        key = Data(bytes)
    }
    var item = query
    item[kSecValueData as String] = key
    item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else {
        fail(status == errSecDuplicateItem ? "Key already exists; it was not overwritten." : "Unable to save database key in Keychain.")
    }
    // Creation never exports the secret. Recovery export is a separate,
    // explicitly approved workflow using read through a private pipe.
default:
    fail("Expected create, read or restore.")
}
