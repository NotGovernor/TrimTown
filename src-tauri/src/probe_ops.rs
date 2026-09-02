use crate::frame_ops::parse_rate;
use crate::models::{ClipMeta, ProbeError};
use serde_json::Value;

pub fn clip_meta_from_ffprobe_json(json: &str) -> Result<ClipMeta, ProbeError> {
    let value: Value =
        serde_json::from_str(json).map_err(|e| ProbeError::InvalidJson(e.to_string()))?;

    let streams = value
        .get("streams")
        .and_then(|s| s.as_array())
        .ok_or(ProbeError::NoVideoStream)?;

    let video = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"))
        .ok_or(ProbeError::NoVideoStream)?;

    let duration = json_f64(value.get("format").and_then(|f| f.get("duration")))
        .or_else(|| json_f64(video.get("duration")))
        .unwrap_or(0.0);

    let nb_frames = json_u64(video.get("nb_frames")).unwrap_or(0);

    let fps = parse_rate(json_str(video.get("avg_frame_rate")))
        .filter(|r| *r > 0.0)
        .or_else(|| parse_rate(json_str(video.get("r_frame_rate"))).filter(|r| *r > 0.0))
        .or_else(|| {
            if nb_frames > 0 && duration > 0.0 {
                Some(nb_frames as f64 / duration)
            } else {
                None
            }
        })
        .filter(|r| *r > 0.0)
        .unwrap_or(24.0);

    let frame_count = if nb_frames > 0 {
        nb_frames
    } else {
        ((duration * fps).round() as u64).max(1)
    };

    let pix_fmt = json_str(video.get("pix_fmt")).to_string();
    let color_transfer = json_str(video.get("color_transfer")).to_string();
    let pix_fmt_l = pix_fmt.to_ascii_lowercase();
    let ten_bit = pix_fmt_l.contains("10le")
        || pix_fmt_l.contains("10be")
        || pix_fmt_l.contains("p010")
        || pix_fmt_l.contains("p210")
        || pix_fmt_l.contains("p012")
        || pix_fmt_l.contains("yuv420p10")
        || pix_fmt_l.contains("yuv422p10")
        || pix_fmt_l.contains("yuv444p10");
    let hdr = color_transfer == "smpte2084" || color_transfer == "arib-std-b67";

    Ok(ClipMeta {
        path: String::new(),
        duration,
        fps,
        frame_count,
        width: json_u64(video.get("width")).unwrap_or(0) as u32,
        height: json_u64(video.get("height")).unwrap_or(0) as u32,
        codec_name: json_str(video.get("codec_name")).to_string(),
        pix_fmt,
        color_transfer,
        ten_bit,
        hdr,
        has_video: true,
    })
}

fn json_str(v: Option<&Value>) -> &str {
    v.and_then(|v| v.as_str()).unwrap_or("")
}

fn json_f64(v: Option<&Value>) -> Option<f64> {
    v.and_then(|v| {
        v.as_f64()
            .or_else(|| v.as_i64().map(|n| n as f64))
            .or_else(|| v.as_u64().map(|n| n as f64))
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    })
}

fn json_u64(v: Option<&Value>) -> Option<u64> {
    v.and_then(|v| {
        v.as_u64()
            .or_else(|| v.as_i64().and_then(|n| u64::try_from(n).ok()))
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    })
}

#[cfg(test)]
mod tests {
    use super::clip_meta_from_ffprobe_json;
    use crate::models::ProbeError;

    fn h264_24fps_json() -> &'static str {
        r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1920,
                    "height": 1080,
                    "pix_fmt": "yuv420p",
                    "avg_frame_rate": "24/1",
                    "r_frame_rate": "24/1",
                    "nb_frames": "240",
                    "duration": "10.000000"
                }
            ],
            "format": { "duration": "10.000000" }
        }"#
    }

    fn hevc_hdr10_json() -> &'static str {
        r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "hevc",
                    "width": 3840,
                    "height": 2160,
                    "pix_fmt": "yuv420p10le",
                    "avg_frame_rate": "24/1",
                    "nb_frames": "48",
                    "color_transfer": "smpte2084"
                }
            ],
            "format": { "duration": "2.000000" }
        }"#
    }

    fn audio_only_json() -> &'static str {
        r#"{
            "streams": [
                {
                    "codec_type": "audio",
                    "codec_name": "aac"
                }
            ],
            "format": { "duration": "10.000000" }
        }"#
    }

    fn missing_nb_frames_json() -> &'static str {
        r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 640,
                    "height": 480,
                    "pix_fmt": "yuv420p",
                    "avg_frame_rate": "25/1"
                }
            ],
            "format": { "duration": "10" }
        }"#
    }

    #[test]
    fn h264_24fps_yuv420p_parses_clip_meta() {
        let meta = clip_meta_from_ffprobe_json(h264_24fps_json()).expect("should parse");
        assert!(meta.has_video);
        assert_eq!(meta.fps, 24.0);
        assert_eq!(meta.frame_count, 240);
        assert_eq!(meta.codec_name, "h264");
        assert!(!meta.ten_bit);
        assert!(!meta.hdr);
        assert_eq!(meta.path, "");
        assert_eq!(meta.duration, 10.0);
    }

    #[test]
    fn hevc_10bit_smpte2084_is_hdr_and_ten_bit() {
        let meta = clip_meta_from_ffprobe_json(hevc_hdr10_json()).expect("should parse");
        assert!(meta.hdr);
        assert!(meta.ten_bit);
        assert_eq!(meta.codec_name, "hevc");
        assert_eq!(meta.pix_fmt, "yuv420p10le");
    }

    #[test]
    fn audio_only_is_no_video_stream() {
        let err = clip_meta_from_ffprobe_json(audio_only_json()).unwrap_err();
        assert!(matches!(err, ProbeError::NoVideoStream));
    }

    #[test]
    fn missing_nb_frames_uses_duration_times_fps() {
        let meta = clip_meta_from_ffprobe_json(missing_nb_frames_json()).expect("should parse");
        assert_eq!(meta.frame_count, 250);
        assert_eq!(meta.fps, 25.0);
        assert_eq!(meta.duration, 10.0);
    }

    #[test]
    fn invalid_json_is_invalid_json() {
        let err = clip_meta_from_ffprobe_json("not json").unwrap_err();
        assert!(matches!(err, ProbeError::InvalidJson(_)));
    }

    #[test]
    fn audio_then_video_picks_video() {
        let json = r#"{
            "streams": [
                { "codec_type": "audio", "codec_name": "aac" },
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1280,
                    "height": 720,
                    "pix_fmt": "yuv420p",
                    "avg_frame_rate": "30/1",
                    "nb_frames": "30"
                }
            ],
            "format": { "duration": "1.000000" }
        }"#;
        let meta = clip_meta_from_ffprobe_json(json).expect("should parse");
        assert!(meta.has_video);
        assert_eq!(meta.codec_name, "h264");
        assert_eq!(meta.width, 1280);
        assert_eq!(meta.fps, 30.0);
    }

    #[test]
    fn avg_frame_rate_0_0_uses_r_frame_rate() {
        let json = r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 640,
                    "height": 480,
                    "pix_fmt": "yuv420p",
                    "avg_frame_rate": "0/0",
                    "r_frame_rate": "24/1",
                    "nb_frames": "48"
                }
            ],
            "format": { "duration": "2.000000" }
        }"#;
        let meta = clip_meta_from_ffprobe_json(json).expect("should parse");
        assert_eq!(meta.fps, 24.0);
    }

    #[test]
    fn both_rates_missing_uses_nb_frames_over_duration() {
        let json = r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 640,
                    "height": 480,
                    "pix_fmt": "yuv420p",
                    "nb_frames": "50"
                }
            ],
            "format": { "duration": "2.000000" }
        }"#;
        let meta = clip_meta_from_ffprobe_json(json).expect("should parse");
        assert_eq!(meta.fps, 25.0);
        assert_eq!(meta.frame_count, 50);
    }

    #[test]
    fn all_rate_fields_missing_defaults_fps_24() {
        let json = r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 640,
                    "height": 480,
                    "pix_fmt": "yuv420p"
                }
            ],
            "format": { "duration": "0" }
        }"#;
        let meta = clip_meta_from_ffprobe_json(json).expect("should parse");
        assert_eq!(meta.fps, 24.0);
    }

    #[test]
    fn yuv410p_is_not_ten_bit() {
        let json = r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 640,
                    "height": 480,
                    "pix_fmt": "yuv410p",
                    "avg_frame_rate": "24/1",
                    "nb_frames": "24"
                }
            ],
            "format": { "duration": "1.000000" }
        }"#;
        let meta = clip_meta_from_ffprobe_json(json).expect("should parse");
        assert!(!meta.ten_bit);
        assert_eq!(meta.pix_fmt, "yuv410p");
    }
}
