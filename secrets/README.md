# Secrets used for our CI/CD pipeline are stored in this directory.

They include:

- [`rsa_private.pem`](rsa_private.pem) — used for webhook receivers to decrypt events sent to them
  - This is the key stored by the platform integrating Kayle ID to decrypt events sent to them
- [`rsa_public.pem`](rsa_public.pem) — used for encrypting events to send to webhook receivers
  - Kayle ID uses this key to encrypt events before sending them to webhook receivers
