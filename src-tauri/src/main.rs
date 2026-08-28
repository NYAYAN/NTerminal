// Windows'ta surum yapisinda konsol penceresi acilmasin; hata ayiklama
// yapisinda acik kalsin ki eprintln! ciktilari gorulebilsin.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nterminal_lib::run()
}
