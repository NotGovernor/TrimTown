use std::collections::HashSet;

use crate::models::{ClipMeta, TrimMode};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncoderChoice {
    pub name: String,
    pub args: Vec<String>,
}

pub fn parse_encoder_names(stdout: &str) -> HashSet<String> {
    let mut names = HashSet::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(flags) = parts.next() else {
            continue;
        };
        if flags.len() != 6 {
            continue;
        }
        let first = flags.as_bytes()[0];
        if !matches!(first, b'V' | b'A' | b'S') {
            continue;
        }
        let Some(name) = parts.next() else {
            continue;
        };
        if name == "=" {
            continue;
        }
        names.insert(name.to_string());
    }
    names
}

pub fn is_gpu_encoder(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.contains("_nvenc") || n.contains("_qsv") || n.contains("_amf")
}

pub fn describe_encoder_label(name: &str) -> String {
    if name.is_empty() {
        String::new()
    } else if is_gpu_encoder(name) {
        name.to_string()
    } else {
        format!("{name} (CPU)")
    }
}

pub fn will_use_label(mode: TrimMode, encoder_name: &str) -> String {
    match mode {
        TrimMode::Fast => "copy".to_string(),
        TrimMode::Accurate => describe_encoder_label(encoder_name),
    }
}

pub fn software_encoder(meta: &ClipMeta) -> EncoderChoice {
    let codec = meta.codec_name.to_ascii_lowercase();
    software_choice(meta, &codec)
}

pub fn should_retry_with_software(success: bool, encoder_name: &str) -> bool {
    !success && is_gpu_encoder(encoder_name)
}

pub fn pick_encoder(meta: &ClipMeta, cpu_only: bool, available: &HashSet<String>) -> EncoderChoice {
    let force_software = cpu_only || meta.ten_bit || meta.hdr || pix_fmt_looks_10bit(&meta.pix_fmt);
    let codec = meta.codec_name.to_ascii_lowercase();

    if force_software {
        return software_choice(meta, &codec);
    }

    if is_h264(&codec) {
        for name in ["h264_nvenc", "h264_qsv", "h264_amf"] {
            if available.contains(name) {
                return gpu_choice(name);
            }
        }
        return software_choice(meta, &codec);
    }

    if is_hevc(&codec) {
        for name in ["hevc_nvenc", "hevc_qsv", "hevc_amf"] {
            if available.contains(name) {
                return gpu_choice(name);
            }
        }
        return software_choice(meta, &codec);
    }

    software_choice(meta, &codec)
}

fn pix_fmt_looks_10bit(pix_fmt: &str) -> bool {
    let p = pix_fmt.to_ascii_lowercase();
    p.contains("10le")
        || p.contains("10be")
        || p.contains("p010")
        || p.contains("p210")
        || p.contains("p012")
        || p.contains("yuv420p10")
        || p.contains("yuv422p10")
        || p.contains("yuv444p10")
}

fn is_h264(codec: &str) -> bool {
    matches!(codec, "h264" | "avc1")
}

fn is_hevc(codec: &str) -> bool {
    matches!(codec, "hevc" | "h265" | "hev1" | "hvc1")
}

fn software_choice(meta: &ClipMeta, codec: &str) -> EncoderChoice {
    if is_hevc(codec) {
        EncoderChoice {
            name: "libx265".to_string(),
            args: vec![
                "-crf".into(),
                "18".into(),
                "-preset".into(),
                "medium".into(),
            ],
        }
    } else {
        let pix = if meta.pix_fmt.is_empty() {
            "yuv420p"
        } else {
            meta.pix_fmt.as_str()
        };
        EncoderChoice {
            name: "libx264".to_string(),
            args: vec![
                "-crf".into(),
                "18".into(),
                "-preset".into(),
                "medium".into(),
                "-pix_fmt".into(),
                pix.to_string(),
            ],
        }
    }
}

fn gpu_choice(name: &str) -> EncoderChoice {
    let args = if name.ends_with("_nvenc") {
        vec![
            "-rc".into(),
            "vbr".into(),
            "-cq".into(),
            "19".into(),
            "-b:v".into(),
            "0".into(),
            "-preset".into(),
            "p4".into(),
        ]
    } else if name.ends_with("_qsv") {
        vec!["-global_quality".into(), "18".into()]
    } else {
        vec![
            "-rc".into(),
            "cqp".into(),
            "-qp_i".into(),
            "18".into(),
            "-qp_p".into(),
            "18".into(),
        ]
    };
    EncoderChoice {
        name: name.to_string(),
        args,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ClipMeta, TrimMode};

    fn clip_meta(codec_name: &str, pix_fmt: &str, ten_bit: bool, hdr: bool) -> ClipMeta {
        ClipMeta {
            path: String::new(),
            duration: 10.0,
            fps: 24.0,
            frame_count: 240,
            width: 1920,
            height: 1080,
            codec_name: codec_name.to_string(),
            pix_fmt: pix_fmt.to_string(),
            color_transfer: if hdr {
                "smpte2084".to_string()
            } else {
                String::new()
            },
            ten_bit,
            hdr,
            has_video: true,
        }
    }

    fn names(list: &[&str]) -> HashSet<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parse_encoder_names_takes_token_after_flags() {
        let stdout = "\
Encoders:
 V..... = Video
 A..... = Audio
 ------
 V..... libx264              libx264 H.264 / AVC
 V....D h264_nvenc           NVIDIA NVENC H.264 encoder
 V..... hevc_qsv             HEVC (Intel Quick Sync)
 A..... aac                  AAC (Advanced Audio Coding)
";
        let parsed = parse_encoder_names(stdout);
        assert!(parsed.contains("libx264"));
        assert!(parsed.contains("h264_nvenc"));
        assert!(parsed.contains("hevc_qsv"));
        assert!(parsed.contains("aac"));
        assert!(!parsed.contains("="));
        assert!(!parsed.contains("Video"));
    }

    #[test]
    fn cpu_only_h264_uses_libx264_even_if_nvenc_listed() {
        let meta = clip_meta("h264", "yuv420p", false, false);
        let available = names(&["h264_nvenc", "libx264"]);
        let choice = pick_encoder(&meta, true, &available);
        assert_eq!(choice.name, "libx264");
        assert_eq!(
            choice.args,
            vec!["-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p"]
        );
    }

    #[test]
    fn h264_8bit_nvenc_listed_picks_h264_nvenc() {
        let meta = clip_meta("h264", "yuv420p", false, false);
        let available = names(&["h264_nvenc", "h264_qsv", "libx264"]);
        let choice = pick_encoder(&meta, false, &available);
        assert_eq!(choice.name, "h264_nvenc");
        assert_eq!(
            choice.args,
            vec!["-rc", "vbr", "-cq", "19", "-b:v", "0", "-preset", "p4"]
        );
    }

    #[test]
    fn hevc_8bit_only_qsv_picks_hevc_qsv() {
        let meta = clip_meta("hevc", "yuv420p", false, false);
        let available = names(&["hevc_qsv", "libx265"]);
        let choice = pick_encoder(&meta, false, &available);
        assert_eq!(choice.name, "hevc_qsv");
        assert_eq!(choice.args, vec!["-global_quality", "18"]);
    }

    #[test]
    fn ten_bit_h264_with_nvenc_uses_libx264() {
        let meta = clip_meta("h264", "yuv420p10le", true, false);
        let available = names(&["h264_nvenc", "libx264"]);
        let choice = pick_encoder(&meta, false, &available);
        assert_eq!(choice.name, "libx264");
        assert_eq!(
            choice.args,
            vec!["-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p10le"]
        );
    }

    #[test]
    fn hdr_hevc_uses_libx265() {
        let meta = clip_meta("hevc", "yuv420p", false, true);
        let available = names(&["hevc_nvenc", "hevc_qsv", "libx265"]);
        let choice = pick_encoder(&meta, false, &available);
        assert_eq!(choice.name, "libx265");
        assert_eq!(choice.args, vec!["-crf", "18", "-preset", "medium"]);
    }

    #[test]
    fn vp9_uses_libx264() {
        let meta = clip_meta("vp9", "yuv420p", false, false);
        let available = names(&["h264_nvenc", "hevc_nvenc", "libx264"]);
        let choice = pick_encoder(&meta, false, &available);
        assert_eq!(choice.name, "libx264");
    }

    #[test]
    fn no_gpu_names_uses_software() {
        let h264 = clip_meta("avc1", "yuv420p", false, false);
        let hevc = clip_meta("hvc1", "yuv420p", false, false);
        let available = names(&["libx264", "libx265"]);
        assert_eq!(pick_encoder(&h264, false, &available).name, "libx264");
        assert_eq!(pick_encoder(&hevc, false, &available).name, "libx265");
    }

    #[test]
    fn will_use_label_fast_is_copy() {
        assert_eq!(will_use_label(TrimMode::Fast, "h264_nvenc"), "copy");
        assert_eq!(will_use_label(TrimMode::Fast, "libx264"), "copy");
    }

    #[test]
    fn will_use_label_accurate_uses_describe() {
        assert_eq!(will_use_label(TrimMode::Accurate, "h264_nvenc"), "h264_nvenc");
        assert_eq!(
            will_use_label(TrimMode::Accurate, "libx264"),
            "libx264 (CPU)"
        );
    }

    #[test]
    fn describe_gpu_is_bare_name() {
        assert_eq!(describe_encoder_label("h264_nvenc"), "h264_nvenc");
        assert_eq!(describe_encoder_label("hevc_qsv"), "hevc_qsv");
    }

    #[test]
    fn describe_software_adds_cpu() {
        assert_eq!(describe_encoder_label("libx264"), "libx264 (CPU)");
        assert_eq!(describe_encoder_label("libx265"), "libx265 (CPU)");
    }

    #[test]
    fn retry_software_only_after_gpu_failure() {
        assert!(should_retry_with_software(false, "h264_nvenc"));
        assert!(!should_retry_with_software(true, "h264_nvenc"));
        assert!(!should_retry_with_software(false, "libx264"));
    }
}
