import XCTest

final class OneStackUITests: XCTestCase {
    func testNativeNavigation() {
        let app = XCUIApplication()
        app.launch()
        defer { print(app.debugDescription) }
        XCTAssertTrue(app.staticTexts["OneStack Universal"].waitForExistence(timeout: 15))
        app.buttons["Billing"].tap()
        XCTAssertTrue(app.staticTexts["Checkout requires server-side Stripe test credentials and STRIPE_PRICE_ID."].waitForExistence(timeout: 5))
        app.buttons["Notes"].tap()
        XCTAssertTrue(app.buttons["Save and read notes"].waitForExistence(timeout: 5))
    }
}
