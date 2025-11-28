Privacy-first identity verification.

# Kayle ID

Kayle ID is a project engineered by [Kayle](https://kayle.ai) to give people control over their own identity.

It's free for everyone to use at [our official website](https://kayle.id).

This open-source repository contains the official implementation of the Kayle ID system.

## Data Processing

Kayle ID processes end-user identity data to perform document checks.

We minimise what we store, encrypt all verification results, and never use this data for any purpose other than verification. You can read more about our data processing in our [privacy policy](https://kayle.id/privacy).

## Webhooks

Kayle ID is webhook-based. This means that in order for a platform to view verification events, they must provide a webhook URL and a public key.

Kayle ID sends a JWE to the webhook URL signed by the platform's public key and a HMAC-SHA256 signature of the JWE payload using a secret key shared between Kayle ID and the platform.

A platform must first verify HMAC signature to prove authenticity of the JWE, and then decrypt the JWE to view the payload.

**Kayle ID is not able to view the payload once it's encrypted.**

A public-private key pair can be generated using the following command:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out secrets/rsa_private.pem && openssl rsa -pubout -in secrets/rsa_private.pem -out secrets/rsa_public.pem
```

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

<sub>Copyright © 2025 Kayle Inc. All rights reserved.</sub>
