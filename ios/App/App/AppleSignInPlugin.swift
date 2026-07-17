import Foundation
import Capacitor
import AuthenticationServices

/// Native "Sign in with Apple" plugin.
///
/// This is a small first-party plugin (no third-party npm dependency) that
/// wraps Apple's own `AuthenticationServices` framework. A previous build
/// used `@capgo/capacitor-social-login` for this, which was removed from
/// the project — leaving native-apple-sign-in.ts posting to a server route
/// that never existed (`/api/auth/apple/web-initiate`), which is what
/// caused Apple's App Review rejection under 2.1.1(a) ("error shown when
/// tapping Sign in with Apple"). See docs/app-store-rejection-2026-07.md.
///
/// Using AuthenticationServices directly (rather than reinstalling a
/// third-party plugin) avoids reintroducing the SPM-compilation drift that
/// has bitten this project before (see the Camera/StatusBar fix in the
/// same rejection doc) — there is no npm package to fall out of sync here.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {

    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 13.0, *) {
            call.resolve(["value": true])
        } else {
            call.resolve(["value": false])
        }
    }

    @objc func signIn(_ call: CAPPluginCall) {
        guard #available(iOS 13.0, *) else {
            call.reject("Sign in with Apple requires iOS 13 or later", "UNAVAILABLE")
            return
        }

        pendingCall = call
        call.keepAlive = true

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    @available(iOS 13.0, *)
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        call.keepAlive = false

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple did not return a valid identity token", "NO_TOKEN")
            return
        }

        var fullName: String? = nil
        if let nameComponents = credential.fullName {
            let formatted = PersonNameComponentsFormatter().string(from: nameComponents)
            if !formatted.trimmingCharacters(in: .whitespaces).isEmpty {
                fullName = formatted
            }
        }

        var result: [String: Any] = [
            "identityToken": identityToken,
            "userIdentifier": credential.user,
        ]
        if let fullName = fullName {
            result["fullName"] = fullName
        }
        if let email = credential.email {
            result["email"] = email
        }

        call.resolve(result)
    }

    @available(iOS 13.0, *)
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        call.keepAlive = false

        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("User cancelled Sign in with Apple", "CANCELLED")
        } else {
            call.reject(error.localizedDescription, "SIGN_IN_FAILED")
        }
    }

    @available(iOS 13.0, *)
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Iterate all connected scenes (handles Split View / Stage Manager on iPad).
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene,
                  windowScene.activationState == .foregroundActive else { continue }
            // Prefer the key window; fall back to any window in this scene.
            if let window = windowScene.windows.first(where: { $0.isKeyWindow }) {
                return window
            }
            if let window = windowScene.windows.first {
                return window
            }
        }
        // Absolute fallback for single-scene apps on older OS.
        if let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) {
            return window
        }
        if let window = UIApplication.shared.windows.first {
            return window
        }
        return UIWindow()
    }
}
