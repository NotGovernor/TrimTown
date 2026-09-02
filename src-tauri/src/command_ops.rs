use crate::encoder_ops::EncoderChoice;
use crate::frame_ops::frame_to_seconds;
use crate::models::TrimMode;

pub fn build_trim_args(
    input: &str,
    output: &str,
    in_frame: u64,
    out_frame: u64,
    fps: f64,
    mode: TrimMode,
    encoder: &EncoderChoice,
) -> Vec<String> {
    let in_sec = frame_to_seconds(in_frame, fps).to_string();
    let duration_sec = frame_to_seconds(out_frame - in_frame, fps).to_string();
    match mode {
        TrimMode::Fast => vec![
            "-hide_banner".into(),
            "-y".into(),
            "-ss".into(),
            in_sec,
            "-i".into(),
            input.to_string(),
            "-t".into(),
            duration_sec,
            "-map".into(),
            "0".into(),
            "-c".into(),
            "copy".into(),
            "-avoid_negative_ts".into(),
            "make_zero".into(),
            output.to_string(),
        ],
        TrimMode::Accurate => {
            let mut args = vec![
                "-hide_banner".into(),
                "-y".into(),
                "-i".into(),
                input.to_string(),
                "-ss".into(),
                in_sec,
                "-t".into(),
                duration_sec,
                "-map".into(),
                "0".into(),
                "-c:v".into(),
                encoder.name.clone(),
            ];
            args.extend(encoder.args.iter().cloned());
            args.extend([
                "-c:a".into(),
                "copy".into(),
                "-c:s".into(),
                "copy".into(),
                "-c:d".into(),
                "copy".into(),
                "-avoid_negative_ts".into(),
                "make_zero".into(),
                output.to_string(),
            ]);
            args
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn x264() -> EncoderChoice {
        EncoderChoice {
            name: "libx264".to_string(),
            args: vec![
                "-crf".into(),
                "18".into(),
                "-preset".into(),
                "medium".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
        }
    }

    fn nvenc() -> EncoderChoice {
        EncoderChoice {
            name: "h264_nvenc".to_string(),
            args: vec![
                "-rc".into(),
                "vbr".into(),
                "-cq".into(),
                "19".into(),
                "-b:v".into(),
                "0".into(),
                "-preset".into(),
                "p4".into(),
            ],
        }
    }

    #[test]
    fn accurate_x264_in24_out48_fps24_ss_and_t_are_one() {
        let args = build_trim_args(
            "in.mp4",
            "out.mp4",
            24,
            48,
            24.0,
            TrimMode::Accurate,
            &x264(),
        );
        assert_eq!(
            args,
            vec![
                "-hide_banner",
                "-y",
                "-i",
                "in.mp4",
                "-ss",
                "1",
                "-t",
                "1",
                "-map",
                "0",
                "-c:v",
                "libx264",
                "-crf",
                "18",
                "-preset",
                "medium",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "copy",
                "-c:s",
                "copy",
                "-c:d",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                "out.mp4",
            ]
        );
    }

    #[test]
    fn accurate_nvenc_includes_nvenc_args() {
        let args = build_trim_args(
            "in.mp4",
            "out.mp4",
            24,
            48,
            24.0,
            TrimMode::Accurate,
            &nvenc(),
        );
        assert_eq!(
            args,
            vec![
                "-hide_banner",
                "-y",
                "-i",
                "in.mp4",
                "-ss",
                "1",
                "-t",
                "1",
                "-map",
                "0",
                "-c:v",
                "h264_nvenc",
                "-rc",
                "vbr",
                "-cq",
                "19",
                "-b:v",
                "0",
                "-preset",
                "p4",
                "-c:a",
                "copy",
                "-c:s",
                "copy",
                "-c:d",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                "out.mp4",
            ]
        );
    }

    #[test]
    fn fast_copy_has_ss_before_i_and_c_copy_no_cv() {
        let args = build_trim_args("in.mp4", "out.mp4", 24, 48, 24.0, TrimMode::Fast, &x264());
        assert_eq!(
            args,
            vec![
                "-hide_banner",
                "-y",
                "-ss",
                "1",
                "-i",
                "in.mp4",
                "-t",
                "1",
                "-map",
                "0",
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                "out.mp4",
            ]
        );
    }
}
