// Thin entry point; all logic lives in the library so it can be unit-tested.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ssb_desktop::run();
}
