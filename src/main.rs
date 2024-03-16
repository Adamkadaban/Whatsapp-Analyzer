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

/*
fn parse_whatsapp_file(filename: &String) {

    // let mut df = DataFrame::new();
    // df.add_column("Date".to_string(), Vec::<NaiveDate>::new());
    // df.add_column("Name".to_string(), Vec::<String>::new());
    // df.add_column("Message".to_string(), Vec::<String>::new());

    let mut dates = Vec::new();
    let mut names = Vec::new();
    let mut messages = Vec::new();

   
    // https://doc.rust-lang.org/rust-by-example/std_misc/file/read_lines.html
    if let Ok(lines) = read_lines(filename) {
        // note that the thing after the seconds and before AM/PM is not a space. Why? idk. whatsapp
        let re = Regex::new(r"\[(.*)\] (.*): (.*)").unwrap();
        let mut i = 1;

        for line in lines.flatten() {
            if let Some(caps) = re.captures(&line){
                // https://dtantsur.github.io/rust-openstack/chrono/format/strftime/index.html
                let date = NaiveDateTime::parse_from_str(
                    &caps[1],
                    "%D, %r" // weird whitespace between the two values. 
                ).unwrap_or_else(|err| {
                    eprintln!("Problem parsing arguments: {err}");
                    process::exit(1);
                });

                dates.push(&date);
                names.push(caps[2]);
                messages.push(caps[3]);
            } else {
                // this line is not a new message. treat it as part of the previous message
                continue;
            }
            i += 1;
            if i > 100 {
                break;
            }
            // println!("{}", time.format("around %l %p on %b %-d").to_string());

        }
    }

    let mut df = df!(
        // "Date" => dates.iter().copied().collect::<Vec<_>>(),
        "Name" => &names,
        "Message" => &messages,
    ).unwrap();


    println!("{}", df);
}

*/

fn parse_whatsapp_file(filepath: &String) {
    // let captures = col("column_1");
    let mut df = CsvReader::from_path(filepath).expect("Filepath not found")
        .with_separator('\r' as u8)
        .has_header(false)
        .with_columns(  // takes in Option<Vec<String>>
            // captures.extract_groups(r"\[(.*)\] (.*): (.*)")
            // Some(vec!["Date".to_string(), "Name".to_string(), "Message".to_string()])
            Some(vec!["column_1".into()])
        )
        .truncate_ragged_lines(true)
        .finish().unwrap();
    
    println!("{}", df);
}

fn main(){
    let args: Vec<String> = env::args().collect();

    let filename = &args[1]; // filename

    parse_whatsapp_file(filename);
}
