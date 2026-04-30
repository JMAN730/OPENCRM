#[cfg(not(debug_assertions))]
use std::net::{TcpListener, TcpStream};
#[cfg(not(debug_assertions))]
use std::process::{Child, Command, Stdio};
#[cfg(not(debug_assertions))]
use std::sync::Mutex;
#[cfg(not(debug_assertions))]
use std::thread;
#[cfg(not(debug_assertions))]
use std::time::{Duration, Instant};
#[cfg(not(debug_assertions))]
use tauri::Manager;

#[cfg(not(debug_assertions))]
struct ServerProcess(Mutex<Child>);

#[cfg(not(debug_assertions))]
fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("no free port available")
        .local_addr()
        .unwrap()
        .port()
}

#[cfg(not(debug_assertions))]
fn wait_for_port(port: u16) -> bool {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if Instant::now() > deadline {
            return false;
        }
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            // Give the HTTP server a moment to finish its own init after the
            // TCP socket becomes reachable.
            thread::sleep(Duration::from_millis(400));
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
}

// Only compiled (and called) in release builds — dev mode uses devUrl instead.
#[cfg(not(debug_assertions))]
fn start_server(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let server_dir = resource_dir.join("server");
    let server_js = server_dir.join("server.js");

    // Store the SQLite database in the user's AppData directory so it persists
    // across app updates without being overwritten.
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("opencrm.db");

    // Seed from the bundled copy on first run.
    if !db_path.exists() {
        let bundled_db = server_dir.join("prisma").join("dev.db");
        if bundled_db.exists() {
            std::fs::copy(&bundled_db, &db_path)?;
        }
    }

    let port = free_port();
    let database_url = format!("file:{}", db_path.display());
    let nextauth_url = format!("http://127.0.0.1:{}", port);

    let child = Command::new("node")
        .arg(&server_js)
        .current_dir(&server_dir)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("DATABASE_URL", &database_url)
        .env("NEXTAUTH_URL", &nextauth_url)
        .env("NEXTAUTH_SECRET", "opencrm-desktop-secret")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    app.manage(ServerProcess(Mutex::new(child)));

    if !wait_for_port(port) {
        return Err("Next.js server did not become ready within 30 seconds".into());
    }

    let win = app
        .get_webview_window("main")
        .ok_or("main window not found")?;

    let url: tauri::Url = format!("http://127.0.0.1:{}", port).parse()?;
    win.navigate(url);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            #[cfg(not(debug_assertions))]
            start_server(_app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|_app, event| {
            // Kill the bundled Node.js server when the app exits.
            if let tauri::RunEvent::Exit = event {
                #[cfg(not(debug_assertions))]
                if let Some(proc) = _app.try_state::<ServerProcess>() {
                    proc.0.lock().unwrap().kill().ok();
                }
            }
        });
}
