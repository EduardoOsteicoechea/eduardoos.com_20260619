//! Raw PDF construction from first principles — objects, streams, xref, trailer.

/// Converts millimeters to PDF points using the exact formula from project rules.
pub fn mm_to_points(mm: f64) -> f64 {
    mm * (72.0 / 25.4)
}

/// Builds a minimal valid PDF with a single text line at a precise mm position.
pub fn build_sample_pdf(title: &str) -> Vec<u8> {
    let x = mm_to_points(20.0);
    let y = mm_to_points(270.0);
    let content = format!(
        "BT /F1 12 Tf {x:.2} {y:.2} Td ({}) Tj ET",
        escape_pdf_string(title)
    );

    let objects = vec![
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n".to_string(),
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n".to_string(),
        format!(
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
            mm_to_points(210.0),
            mm_to_points(297.0)
        ),
        format!(
            "4 0 obj\n<< /Length {} >>\nstream\n{}\nendstream\nendobj\n",
            content.len(),
            content
        ),
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n".to_string(),
    ];

    let mut pdf = String::from("%PDF-1.4\n");
    let mut offsets = vec![0usize];
    for obj in &objects {
        offsets.push(pdf.len());
        pdf.push_str(obj);
    }

    let xref_start = pdf.len();
    pdf.push_str(&format!("xref\n0 {}\n", objects.len() + 1));
    pdf.push_str("0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.push_str(&format!("{:010} 00000 n \n", offset));
    }
    pdf.push_str(&format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
        objects.len() + 1,
        xref_start
    ));

    pdf.into_bytes()
}

fn escape_pdf_string(input: &str) -> String {
    input.replace('\\', "\\\\").replace('(', "\\(").replace(')', "\\)")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mm_to_points_matches_formula() {
        let pts = mm_to_points(25.4);
        assert!((pts - 72.0).abs() < 0.001);
    }

    #[test]
    fn pdf_starts_with_header_and_ends_with_eof() {
        let bytes = build_sample_pdf("Test");
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.starts_with("%PDF-1.4"));
        assert!(text.contains("%%EOF"));
        assert!(text.contains("xref"));
    }
}
