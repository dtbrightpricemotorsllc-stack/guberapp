import UIKit
import Capacitor

// MARK: - AppDelegate
//
// NOTE: GUBER's location tracking is foreground-only (see
// client/src/services/location/TaskTrackingService.ts + client/src/lib/gps.ts).
// There is intentionally NO "Always" location authorization request and no
// `location` entry in UIBackgroundModes below. A previous build requested
// "Always Allow" unconditionally on every app foreground via
// CLLocationManager.requestAlwaysAuthorization(), even though the background
// capability was never actually wired up (UIBackgroundModes never declared
// "location", so the permission did nothing functionally). Apple rejected
// build 1.0.0 (7) over this exact mismatch (Guidelines 5.1.1 and 2.5.4) — see
// docs/app-store-rejection-2026-07.md. Do not reintroduce an Always-location
// request unless a real, user-initiated background tracking feature backs it,
// and the UIBackgroundModes "location" key is added at the same time.

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
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
