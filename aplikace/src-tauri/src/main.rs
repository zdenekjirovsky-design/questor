// Zabranuje otevreni konzoloveho okna na Windows v release buildu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    questor_lib::run()
}
