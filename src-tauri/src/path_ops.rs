use std::path::{Path, PathBuf};

pub fn trimmed_output_path(input: &Path) -> PathBuf {
    let stem = input.file_stem().unwrap_or_default();
    let ext = input.extension();
    let stem_str = stem.to_string_lossy();
    let mut name = format!("{}_trimmed", stem_str);
    if let Some(ext) = ext {
        name.push('.');
        name.push_str(&ext.to_string_lossy());
    }
    match input.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.join(name),
        _ => PathBuf::from(name),
    }
}

pub fn output_exists(path: &Path) -> bool {
    path.is_file()
}

pub fn paths_equal(a: &Path, b: &Path) -> bool {
    #[cfg(windows)]
    {
        a.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&b.as_os_str().to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        a == b
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_trimmed_before_extension() {
        let out = trimmed_output_path(Path::new(r"M:\clips\hero.mp4"));
        assert_eq!(out, PathBuf::from(r"M:\clips\hero_trimmed.mp4"));
    }

    #[test]
    fn unix_appends_trimmed_before_extension() {
        let out = trimmed_output_path(Path::new("/tmp/hero.mp4"));
        assert_eq!(out.file_name().unwrap(), "hero_trimmed.mp4");
        assert_eq!(out.parent().unwrap(), Path::new("/tmp"));
    }

    #[test]
    fn preserves_double_extension_as_single_ext() {
        let out = trimmed_output_path(Path::new("/tmp/a.b.mkv"));
        assert_eq!(out.file_name().unwrap(), "a.b_trimmed.mkv");
    }

    #[test]
    fn no_extension() {
        let out = trimmed_output_path(Path::new("/tmp/clip"));
        assert_eq!(out.file_name().unwrap(), "clip_trimmed");
    }

    #[test]
    fn always_appends_trimmed_even_if_stem_ends_with_trimmed() {
        let out = trimmed_output_path(Path::new("/tmp/hero_trimmed.mp4"));
        assert_eq!(out.file_name().unwrap(), "hero_trimmed_trimmed.mp4");
    }

    #[test]
    fn stacks_trimmed_a_third_time() {
        let out = trimmed_output_path(Path::new("/tmp/hero_trimmed_trimmed.mp4"));
        assert_eq!(
            out.file_name().unwrap(),
            "hero_trimmed_trimmed_trimmed.mp4"
        );
    }

    #[test]
    fn output_exists_true_for_file() {
        let p = std::env::temp_dir().join(format!(
            "trimtown_exists_{}_{}.txt",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&p, b"x").unwrap();
        assert!(output_exists(&p));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn output_exists_false_for_missing() {
        assert!(!output_exists(Path::new(
            "/this/does/not/exist/trimtown_nope.mp4"
        )));
    }

    #[test]
    fn paths_equal_same_string() {
        assert!(paths_equal(
            Path::new(r"C:\clips\a.mp4"),
            Path::new(r"C:\clips\a.mp4")
        ));
    }

    #[test]
    fn paths_equal_rejects_different() {
        assert!(!paths_equal(
            Path::new(r"C:\clips\a.mp4"),
            Path::new(r"C:\clips\a_trimmed.mp4")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn paths_equal_windows_is_case_insensitive() {
        assert!(paths_equal(
            Path::new(r"C:\clips\A.mp4"),
            Path::new(r"c:\clips\a.mp4")
        ));
    }
}
