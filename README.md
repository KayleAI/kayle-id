Privacy-first identity verification.

# Kayle ID

Kayle ID is a project engineered by [Kayle](https://kayle.ai) to give people control over their own identity.

It's free for everyone to use at [our official website](https://kayle.id), and we don't store **any personal data** on our system. 

Business and institutions implement Kayle ID to verify someone is over a certain age, complete a KYC/AML check, or to meet other requirements.

This open-source repository contains the official implementation of the Kayle ID system.

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
