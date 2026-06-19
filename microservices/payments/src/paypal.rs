//! PayPal IPN verification by echoing the payload back to PayPal servers.

use common::AppError;
use reqwest::Client;

/// Verifies an IPN message by POSTing `cmd=_notify-validate` plus the original body.
pub async fn verify_ipn(
    client: &Client,
    verify_url: &str,
    raw_body: &str,
) -> Result<bool, AppError> {
    let payload = format!("cmd=_notify-validate&{raw_body}");
    let response = client
        .post(verify_url)
        .header("content-type", "application/x-www-form-urlencoded")
        .body(payload)
        .send()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    let text = response
        .text()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    Ok(text.trim() == "VERIFIED")
}

/// Parses `key=value` pairs from a URL-encoded IPN body.
pub fn parse_ipn_form(body: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for pair in body.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            let decoded = urlencoding::decode(value)
                .map(|v| v.into_owned())
                .unwrap_or_else(|_| value.to_string());
            map.insert(key.to_string(), decoded);
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ipn_fields() {
        let body = "payment_status=Completed&custom=intent-123&txn_id=TX1";
        let map = parse_ipn_form(body);
        assert_eq!(map.get("payment_status"), Some(&"Completed".to_string()));
        assert_eq!(map.get("custom"), Some(&"intent-123".to_string()));
    }
}
