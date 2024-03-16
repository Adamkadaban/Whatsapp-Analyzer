// for data analysis
use polars::prelude::*;

use std::collections::BTreeMap;
// for argv
use std::env;

// for reading in files
use std::fs::{read_dir, File};
use std::io::{self, BufRead};
use std::path::Path;

// for storing dates
use chrono::{NaiveDateTime, Timelike}; 

// for parsing data from file to turn into dataframe
use regex::Regex;

use std::process;


fn read_lines<P>(filename: P) -> io::Result<io::Lines<io::BufReader<File>>>
where P: AsRef<Path>, {
    let file = File::open(filename)?;
    Ok(io::BufReader::new(file).lines())
}

fn parse_whatsapp_file(filename: &String) {

    let columns = BTreeMap::new();
    
    // https://doc.rust-lang.org/rust-by-example/std_misc/file/read_lines.html
    if let Ok(lines) = read_lines(filename) {
        /*
        Capture groups:
            1 - date
            2 - user
            3 - message
         */

        // note that the thing after the seconds and before AM/PM is not a space. Why? idk. whatsapp
        // let re = Regex::new(r"\[(\d+/\d+/\d+, \d+:\d+:\d+ [AP]M)\] (.*): .*").unwrap();
        let re = Regex::new(r"\[(.*)\] (.*): .*").unwrap();
        let mut i = 1;

        for line in lines.flatten() {
            let caps = re.captures(&line).unwrap();

            // https://dtantsur.github.io/rust-openstack/chrono/format/strftime/index.html
            let time = NaiveDateTime::parse_from_str(
                &caps[1].replace(" ", " "),
                "%D, %r" 
            ).unwrap_or_else(|err| {
                eprintln!("Problem parsing arguments: {err}");
                process::exit(1);
            });

            columns.entry(time).or_insert(vec![]).push(&caps[2]);
            columns.entry(time).or_insert(vec![]).push(&caps[3]);

            i += 1;
            if i > 100 {
                break;
            }
            // println!("{}", time.format("around %l %p on %b %-d").to_string());
        }
    }
    let df = DataFrame::new(
        columns.into_iter()
            .map(|(name, message)| Series::new(name, message))
            .collect::<Vec<_>>()
    ).unwrap();

    println!("{}", df);
}

fn main(){
    let args: Vec<String> = env::args().collect();

    let filename = &args[1]; // filename

    parse_whatsapp_file(filename);


}
