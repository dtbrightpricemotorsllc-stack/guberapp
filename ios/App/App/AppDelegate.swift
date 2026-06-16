import UIKit
import Capacitor
import CoreLocation
import ObjectiveC

// MARK: - CLLocationManager background-update patch
//
// @capacitor/geolocation v7 uses IONGeolocationLib internally, which creates
// its own CLLocationManager. That manager never sets
// allowsBackgroundLocationUpdates = true, so iOS stops delivering location
// events the moment the screen locks — even when the user has granted
// "Always" permission and UIBackgroundModes contains "location".
//
// Fix: swizzle CLLocationManager.startUpdatingLocation() so that every call
// in the process (including the plugin's) automatically sets the flag before
// the original implementation runs. Activated once at app launch.
//
// REQUIREMENT: UIBackgroundModes must contain "location" in Info.plist, which
// it does. Setting allowsBackgroundLocationUpdates = true without that key
// raises NSInternalInconsistencyException at runtime.

private extension CLLocationManager {

    /// Call once at app launch to install the swizzle. Idempotent.
    static func activateBackgroundLocationPatch() {
        _ = _bgPatchToken
    }

    private static let _bgPatchToken: Void = {
        let cls         = CLLocationManager.self
        let originalSel = #selector(CLLocationManager.startUpdatingLocation)
        let patchedSel  = #selector(CLLocationManager._guberStartUpdatingLocation)
        guard
            let orig    = class_getInstanceMethod(cls, originalSel),
            let patched = class_getInstanceMethod(cls, patchedSel)
        else {
            print("[GUBER] BackgroundLocationPatch: swizzle failed — background GPS unavailable")
            return
        }
        method_exchangeImplementations(orig, patched)
        print("[GUBER] BackgroundLocationPatch: active — allowsBackgroundLocationUpdates will be set on every CLLocationManager.startUpdatingLocation() call")
    }()

    // After method_exchangeImplementations the selector names are swapped:
    // calling _guberStartUpdatingLocation() here invokes the ORIGINAL
    // startUpdatingLocation implementation — no infinite loop.
    @objc func _guberStartUpdatingLocation() {
        let bgModes = Bundle.main.infoDictionary?["UIBackgroundModes"] as? [String] ?? []
        if bgModes.contains("location") {
            self.allowsBackgroundLocationUpdates = true
            self.pausesLocationUpdatesAutomatically = false
        }
        // Calls original startUpdatingLocation (names are swapped after exchange).
        self._guberStartUpdatingLocation()
    }
}

// MARK: - AppDelegate

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, CLLocationManagerDelegate {

    var window: UIWindow?

    // Dedicated CLLocationManager whose sole purpose is to hold and upgrade
    // location authorization to "Always". The @capacitor/geolocation plugin's
    // IONGeolocationLib manages its own CLLocationManager for GPS delivery;
    // this one only handles the auth level without interfering with that instance.
    private let alwaysLocationManager = CLLocationManager()

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Install the CLLocationManager swizzle before any location watch starts.
        // This ensures allowsBackgroundLocationUpdates = true + pausesLocationUpdatesAutomatically = false
        // are set on the @capacitor/geolocation plugin's internal CLLocationManager
        // when it calls startUpdatingLocation() for the first time.
        CLLocationManager.activateBackgroundLocationPatch()

        alwaysLocationManager.delegate = self
        return true
    }

    // MARK: - Always Location Authorization
    //
    // iOS 13+ "Always" auth two-step flow:
    //   1. JS calls Geolocation.requestPermissions() → plugin requests "When In Use"
    //   2. User grants "When In Use" → OS dialog closes → app becomes active
    //   3. applicationDidBecomeActive fires → we call requestAlwaysAuthorization()
    //   4. iOS shows "Change to Always Allow?" prompt
    //
    // This ensures Asset Protection and Transport job GPS tracking survives
    // screen lock without requiring a third-party background geolocation plugin.

    func applicationDidBecomeActive(_ application: UIApplication) {
        if alwaysLocationManager.authorizationStatus == .authorizedWhenInUse {
            alwaysLocationManager.requestAlwaysAuthorization()
        }
    }

    // CLLocationManagerDelegate — log auth level changes for diagnostics.
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways:
            print("[GUBER] Location auth: Always — background GPS active")
        case .authorizedWhenInUse:
            print("[GUBER] Location auth: When In Use — GPS pauses when screen locks")
        case .denied:
            print("[GUBER] Location auth: Denied")
        case .restricted:
            print("[GUBER] Location auth: Restricted")
        default:
            break
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application,
                                                           continue: userActivity,
                                                           restorationHandler: restorationHandler)
    }

    // MARK: - APNs forwarding for @capacitor/push-notifications
    //
    // The Capacitor PushNotifications plugin listens for these two
    // NotificationCenter events. Without forwarding the OS callbacks below,
    // PushNotifications.register() in JS will NEVER fire its 'registration'
    // listener and we will never receive an APNs device token. This is the
    // documented Capacitor wiring for native iOS push.
    //
    // Reference: https://capacitorjs.com/docs/apis/push-notifications#ios

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }
}
