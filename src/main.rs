// for data analysis
use polars::prelude::*;

// for argv
use std::{env, process::exit};

fn parse_whatsapp_file(filepath: &String) -> DataFrame {
    // let captures = col("column_1");
    let df_raw = CsvReader::from_path(filepath)
        .expect("Filepath not found")
        .with_separator('\r' as u8)
        .has_header(false)
        .with_columns(
            Some(vec!["column_1".to_string()]),
        )
        .truncate_ragged_lines(true)
        .finish()
        .unwrap();

    let groups = df_raw
        .clone()
        .lazy()
        .select([col("column_1")
            .str()
            .extract_groups(r"\[(.*)\] ([^:]+): (.*)")
            .unwrap()])
        .collect()
        .unwrap();

    let df = groups
        .clone()
        .lazy()
        .select([col("column_1")
            .struct_()
            .rename_fields(["dt".into(), "name".into(), "message".into()].to_vec())])
        .unnest(["column_1"])
        .collect()
        .unwrap();

    let df_final = df
        .clone()
        .lazy()
        .select([
            col("dt").str().strptime(
                DataType::Datetime(TimeUnit::Milliseconds, None), // milliseconds?
                StrptimeOptions {
                    format: Some("%D, %r".into()),
                    strict: true,
                    exact: false,
                    cache: true,
                },
                lit("raise"), // what does this mean?
            ),
            col("name"),
            col("message"),
        ])
        .collect()
        .unwrap();

    df_final
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        println!("Please provide the filename to parse");
        exit(0);
    }
    let filename = &args[1]; // filename

    let df = parse_whatsapp_file(filename);

    println!("{}", df);
}
