use secret_service::{blocking::SecretService, EncryptionType, Error};

/// The keyring backend uses the default collection but does not create it when
/// absent. Request one through Secret Service so the desktop owns its password
/// dialog, encryption and persistence; never fall back to the session collection.
pub(crate) fn ensure_default_collection() -> Result<(), String> {
    let service = SecretService::connect(EncryptionType::Dh)
        .map_err(|error| format!("Could not open the system password keyring. {error}"))?;
    let result = match service.get_default_collection() {
        Ok(_) => Ok(()),
        Err(Error::NoResult) => service
            .create_collection("Login", "default")
            .map(|_| ())
            .map_err(|error| match error {
                Error::Prompt => "Password storage setup was cancelled. Connect again and complete the system keyring dialog.".to_string(),
                _ => format!("Could not set up secure password storage. {error}"),
            }),
        Err(error) => Err(format!("Could not access the system password keyring. {error}")),
    };
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    // These exercise a real daemon and its native dialogs. They must run only in
    // a private D-Bus session with a disposable HOME, never a user's keyring.
    fn assert_disposable_session() {
        assert_eq!(
            std::env::var("PRISM_TEST_DISPOSABLE_KEYRING").as_deref(),
            Ok("1")
        );
    }

    #[test]
    #[ignore = "Requires a disposable Secret Service and interactive prompt driver"]
    fn first_save_creates_persistent_default_and_reuses_it() {
        assert_disposable_session();
        let service = SecretService::connect(EncryptionType::Dh).unwrap();
        assert!(matches!(
            service.get_default_collection(),
            Err(Error::NoResult)
        ));
        ensure_default_collection().unwrap();
        let collection = service.get_default_collection().unwrap();
        let original_path = collection.collection_path.clone();
        assert_ne!(
            original_path.as_str(),
            "/org/freedesktop/secrets/collection/session"
        );
        let entry = keyring::Entry::new("prism-disposable-test", "fixture").unwrap();
        entry.set_password("synthetic-first-save").unwrap();
        assert_eq!(entry.get_password().unwrap(), "synthetic-first-save");
        ensure_default_collection().unwrap();
        assert_eq!(
            service.get_default_collection().unwrap().collection_path,
            original_path
        );
        entry.set_password("synthetic-updated-save").unwrap();
        assert_eq!(entry.get_password().unwrap(), "synthetic-updated-save");
        // Existing locked collections are reused. The backend must request the
        // standard unlock prompt before updating their credential.
        collection.lock().unwrap();
        ensure_default_collection().unwrap();
        entry.set_password("synthetic-unlocked-save").unwrap();
        assert_eq!(entry.get_password().unwrap(), "synthetic-unlocked-save");
        entry.delete_credential().unwrap();
    }

    #[test]
    #[ignore = "Requires a disposable Secret Service and interactive prompt driver"]
    fn cancelling_first_setup_reports_error_and_keeps_storage_absent() {
        assert_disposable_session();
        let service = SecretService::connect(EncryptionType::Dh).unwrap();
        assert!(matches!(
            service.get_default_collection(),
            Err(Error::NoResult)
        ));
        let error = ensure_default_collection().unwrap_err();
        assert!(error.contains("cancelled"), "{error}");
        assert!(matches!(
            service.get_default_collection(),
            Err(Error::NoResult)
        ));
    }
}
