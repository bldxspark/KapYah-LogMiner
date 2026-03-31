// File purpose: Rust Tauri command bridge connecting the desktop shell to Python and system actions.
// KapYah LogMiner
// Maintained by Durgesh Tiwari, KapYah Industries Pvt. Ltd.
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

fn workspace_python_engine_root() -> Result<PathBuf, String> {
    // Support both running from the workspace root and from src-tauri/ during development.
    let current_dir = std::env::current_dir().map_err(|err| err.to_string())?;
    let root = if current_dir.ends_with("src-tauri") {
        current_dir
            .parent()
            .map(PathBuf::from)
            .ok_or("Failed to locate workspace root")?
    } else {
        current_dir
    };
    Ok(root.join("python_engine"))
}

fn bundled_backend_executable(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let backend_executable = resource_dir.join("python_backend").join("python_backend.exe");
    if backend_executable.exists() {
        Some(backend_executable)
    } else {
        None
    }
}

fn run_script_backend(args: &[String]) -> Result<Value, String> {
    let engine_root = workspace_python_engine_root()?;
    if !engine_root.exists() {
        return Err("Python engine folder was not found in the workspace.".to_string());
    }

    let script_path = engine_root.join("cli.py");
    if !script_path.exists() {
        return Err(format!(
            "Python CLI was not found at {}",
            script_path.to_string_lossy()
        ));
    }

    let mut attempts = Vec::new();
    attempts.push(("python".to_string(), Vec::<String>::new()));
    attempts.push(("py".to_string(), vec!["-3".to_string()]));

    for (program, prefix_args) in attempts {
        let mut command = Command::new(&program);
        command.current_dir(&engine_root);
        for arg in &prefix_args {
            command.arg(arg);
        }
        command.arg(&script_path);
        for arg in args {
            command.arg(arg);
        }

        match command.output() {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    return serde_json::from_str::<Value>(&stdout)
                        .map_err(|err| format!("Failed to parse analyzer JSON: {err}"));
                }

                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return Err(if !stdout.is_empty() { stdout } else { stderr });
            }
            Err(err) => {
                if err.kind() == std::io::ErrorKind::NotFound {
                    continue;
                }
                return Err(err.to_string());
            }
        }
    }

    Err("Python runtime not found. Install Python and project dependencies first.".to_string())
}

fn run_backend_executable(executable_path: &PathBuf, args: &[String]) -> Result<Value, String> {
    let working_dir = executable_path
        .parent()
        .ok_or("Packaged backend executable has no parent directory")?;

    let mut command = Command::new(executable_path);
    command.current_dir(working_dir);
    for arg in args {
        command.arg(arg);
    }

    let output = command.output().map_err(|err| err.to_string())?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        return serde_json::from_str::<Value>(&stdout)
            .map_err(|err| format!("Failed to parse analyzer JSON: {err}"));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if !stdout.is_empty() { stdout } else { stderr })
}

fn run_python_command(app: &AppHandle, args: &[String]) -> Result<Value, String> {
    if let Some(backend_executable) = bundled_backend_executable(app) {
        return run_backend_executable(&backend_executable, args);
    }

    run_script_backend(args)
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return Err("Only http/https/mailto URLs are allowed.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform for opening URLs.".to_string())
}

#[tauri::command]
fn analyze_log(app: tauri::AppHandle, file_path: String) -> Result<Value, String> {
    run_python_command(&app, &["analyze".to_string(), file_path])
}

#[tauri::command]
fn default_downloads_dir() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let user_profile = std::env::var("USERPROFILE").map_err(|err| err.to_string())?;
        return Ok(PathBuf::from(user_profile)
            .join("Downloads")
            .to_string_lossy()
            .into_owned());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").map_err(|err| err.to_string())?;
        return Ok(PathBuf::from(home).join("Downloads").to_string_lossy().into_owned());
    }
}

#[tauri::command]
fn generate_report(
    app: tauri::AppHandle,
    file_path: String,
    output_dir: Option<String>,
) -> Result<Value, String> {
    let mut args = vec!["export".to_string(), file_path];
    if let Some(output_dir) = output_dir {
        args.push(output_dir);
    }
    run_python_command(&app, &args)
}

#[tauri::command]
fn open_path_in_system(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if !target.exists() {
        return Err("Selected path does not exist.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &target.to_string_lossy()])
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform for opening paths.".to_string())
}

#[tauri::command]
fn delete_report_folder(folder_path: String) -> Result<(), String> {
    let target = PathBuf::from(folder_path);
    if !target.exists() {
        return Ok(());
    }
    if !target.is_dir() {
        return Err("Only generated report folders can be deleted.".to_string());
    }

    let has_known_report_files =
        target.join("flight_data.xlsx").exists() || target.join("mission_report.pdf").exists();
    if !has_known_report_files {
        return Err("Selected folder does not look like a generated report folder.".to_string());
    }

    fs::remove_dir_all(&target).map_err(|err| err.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            analyze_log,
            default_downloads_dir,
            generate_report,
            open_path_in_system,
            delete_report_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running drone log analyzer");
}

