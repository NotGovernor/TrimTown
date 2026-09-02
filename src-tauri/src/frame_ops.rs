pub fn parse_rate(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if let Some((num, den)) = s.split_once('/') {
        let num: f64 = num.parse().ok()?;
        let den: f64 = den.parse().ok()?;
        if den == 0.0 {
            return None;
        }
        let rate = num / den;
        if rate.is_finite() {
            Some(rate)
        } else {
            None
        }
    } else {
        s.parse::<f64>().ok().filter(|r| r.is_finite())
    }
}

pub fn frame_to_seconds(frame: u64, fps: f64) -> f64 {
    frame as f64 / fps
}

pub fn seconds_to_frame(t: f64, fps: f64, frame_count: u64) -> u64 {
    let frame = (t * fps).round() as i64;
    let max = frame_count.saturating_sub(1) as i64;
    frame.clamp(0, max) as u64
}

pub fn format_timecode(frame: u64, fps: f64) -> String {
    let fps_round = fps.round() as u64;
    let ff = if fps_round == 0 { 0 } else { frame % fps_round };
    let total_secs = if fps_round == 0 { 0 } else { frame / fps_round };
    let hh = total_secs / 3600;
    let mm = (total_secs % 3600) / 60;
    let ss = total_secs % 60;
    format!("{hh:02}:{mm:02}:{ss:02}:{ff:02}")
}

pub fn parse_timecode(input: &str, fps: f64) -> Option<u64> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    if s.chars().all(|c| c.is_ascii_digit()) {
        return s.parse().ok();
    }
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 3 && parts.len() != 4 {
        return None;
    }
    let nums: Option<Vec<u64>> = parts.iter().map(|p| p.parse().ok()).collect();
    let nums = nums?;
    let fps_round = fps.round() as u64;
    let hh = nums[0];
    let mm = nums[1];
    let ss = nums[2];
    let ff = if parts.len() == 4 { nums[3] } else { 0 };
    Some((hh * 3600 + mm * 60 + ss) * fps_round + ff)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_rate_fraction() {
        let rate = parse_rate("30000/1001").expect("fraction should parse");
        assert!((rate - 29.97002997).abs() < 1e-6);
    }

    #[test]
    fn parse_rate_integer() {
        assert_eq!(parse_rate("30"), Some(30.0));
    }

    #[test]
    fn parse_rate_zero_over_zero_is_none() {
        assert_eq!(parse_rate("0/0"), None);
    }

    #[test]
    fn frame_0_is_zero_seconds() {
        assert_eq!(frame_to_seconds(0, 25.0), 0.0);
    }

    #[test]
    fn frame_25_at_25fps_is_one_second() {
        assert_eq!(frame_to_seconds(25, 25.0), 1.0);
    }

    #[test]
    fn seconds_to_frame_rounds_and_clamps() {
        assert_eq!(seconds_to_frame(-1.0, 24.0, 100), 0);
        assert_eq!(seconds_to_frame(99.0, 24.0, 100), 99);
        assert_eq!(seconds_to_frame(1.0, 24.0, 100), 24);
    }

    #[test]
    fn timecode_zero() {
        assert_eq!(format_timecode(0, 24.0), "00:00:00:00");
    }

    #[test]
    fn timecode_one_hour_ish() {
        assert_eq!(format_timecode(86400, 24.0), "01:00:00:00");
    }

    #[test]
    fn ndf_ntsc_format_does_not_add_a_second() {
        let ntsc = 30000.0 / 1001.0;
        assert_eq!(format_timecode(8128, ntsc), "00:04:30:28");
    }

    #[test]
    fn ndf_round_trip() {
        let ntsc = 30000.0 / 1001.0;
        let frame = parse_timecode("00:04:30:28", ntsc).expect("parse");
        assert_eq!(format_timecode(frame, ntsc), "00:04:30:28");
    }

    #[test]
    fn parse_hms_as_ff_zero() {
        assert_eq!(parse_timecode("00:00:01", 24.0), Some(24));
    }
}
