use polars::prelude::*; // for data analysis
use std::env; // for argv
use std::fs; // for reading in file 


fn parse_whatsapp_file(filename: &String) -> Option<> {
    let contents = fs::read_to_string(filename)
        .expect("Unable to read data from provided filepath");
}

fn main(){
    let args: Vec<String> = env::args().collect();

    let filename = &args[1]; // filename


}
