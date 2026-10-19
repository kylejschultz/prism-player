#[derive(Clone, Copy)]
pub(crate) struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Work areas are ordered with the primary display first as the fallback.
/// Preserve fully visible placements; otherwise clamp to the most-visible
/// display. Oversized windows keep their size but regain an accessible titlebar.
pub(crate) fn corrected_position(window: Bounds, work_areas: &[Bounds]) -> Option<(i32, i32)> {
    if window.width == 0 || window.height == 0 {
        return None;
    }
    let x = i64::from(window.x);
    let y = i64::from(window.y);
    let width = i64::from(window.width);
    let height = i64::from(window.height);
    let mut best = None;
    let mut best_overlap = 0;
    for area in work_areas {
        if area.width == 0 || area.height == 0 {
            continue;
        }
        let left = i64::from(area.x);
        let top = i64::from(area.y);
        let right = left + i64::from(area.width);
        let bottom = top + i64::from(area.height);
        if x >= left && y >= top && x + width <= right && y + height <= bottom {
            return None;
        }
        let overlap_width = ((x + width).min(right) - x.max(left)).max(0);
        let overlap_height = ((y + height).min(bottom) - y.max(top)).max(0);
        let overlap = overlap_width * overlap_height;
        if best.is_none() || overlap > best_overlap {
            best = Some(area);
            best_overlap = overlap;
        }
    }
    let area = best?;
    let left = i64::from(area.x);
    let top = i64::from(area.y);
    let corrected_x = x.clamp(left, (left + i64::from(area.width) - width).max(left));
    let corrected_y = y.clamp(top, (top + i64::from(area.height) - height).max(top));
    let position = (corrected_x as i32, corrected_y as i32);
    (position != (window.x, window.y)).then_some(position)
}

#[cfg(test)]
mod tests {
    use super::*;
    const SCREEN: Bounds = Bounds {
        x: 0,
        y: 25,
        width: 1920,
        height: 1000,
    };
    fn window(x: i32, y: i32) -> Bounds {
        Bounds {
            x,
            y,
            width: 1200,
            height: 780,
        }
    }

    #[test]
    fn preserves_valid_saved_placements() {
        assert_eq!(corrected_position(window(100, 100), &[SCREEN]), None);
    }

    #[test]
    fn clamps_even_a_partially_offscreen_window() {
        assert_eq!(
            corrected_position(window(1300, 100), &[SCREEN]),
            Some((720, 100))
        );
        assert_eq!(
            corrected_position(window(-10, 100), &[SCREEN]),
            Some((0, 100))
        );
    }

    #[test]
    fn disjoint_axes_cannot_produce_a_false_positive_area() {
        assert_eq!(
            corrected_position(window(4000, 3000), &[SCREEN]),
            Some((720, 245))
        );
        assert_eq!(
            corrected_position(window(-4000, -3000), &[SCREEN]),
            Some((0, 25))
        );
    }

    #[test]
    fn respects_menu_bar_and_dock_work_area() {
        assert_eq!(
            corrected_position(window(100, 0), &[SCREEN]),
            Some((100, 25))
        );
        assert_eq!(
            corrected_position(window(100, 400), &[SCREEN]),
            Some((100, 245))
        );
    }

    #[test]
    fn keeps_secondary_displays_including_negative_coordinates() {
        let secondary = Bounds {
            x: -1600,
            y: 25,
            width: 1600,
            height: 900,
        };
        assert_eq!(
            corrected_position(window(-1500, 50), &[SCREEN, secondary]),
            None
        );
        assert_eq!(
            corrected_position(window(-1700, 50), &[SCREEN, secondary]),
            Some((-1600, 50))
        );
    }

    #[test]
    fn recovers_from_removed_displays_and_supports_physical_pixel_scaling() {
        let retina = Bounds {
            x: 0,
            y: 50,
            width: 3024,
            height: 1800,
        };
        let saved = Bounds {
            x: 4000,
            y: 200,
            width: 2400,
            height: 1560,
        };
        assert_eq!(corrected_position(saved, &[retina]), Some((624, 200)));
        assert_eq!(corrected_position(saved, &[]), None);
    }

    #[test]
    fn oversized_windows_retain_accessible_titlebars() {
        let small = Bounds {
            x: 0,
            y: 25,
            width: 1000,
            height: 650,
        };
        assert_eq!(
            corrected_position(window(-500, -500), &[small]),
            Some((0, 25))
        );
        assert_eq!(corrected_position(window(0, 25), &[small]), None);
    }
}
