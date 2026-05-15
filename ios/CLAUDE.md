# Wakaman iOS — Conventions Swift

## Stack

- **Langage** : Swift 5.9+
- **UI** : SwiftUI (iOS 16+ minimum)
- **Architecture** : MVVM
- **Async** : Swift Concurrency (async/await + actors)
- **Réseau** : URLSession (pas de libs tierces)
- **Persistance** : Core Data + UserDefaults
- **Cartographie** : Mapbox iOS SDK
- **Push** : Firebase Cloud Messaging + APNs

## 2 apps iOS (pas d'app Coursier iOS)

| App | Module | Particularités |
|---|---|---|
| **ClientApp** | Client final | Cible : clients premium iPhone |
| **MerchantApp** | Marchand | Cible : restaurants haut de gamme |

**Pas d'app Coursier iOS** : aucun coursier au Cameroun n'a d'iPhone.

## Structure par app

```
ClientApp/
├── Sources/
│   ├── App/
│   │   ├── WakamanApp.swift                 # @main App
│   │   └── AppDelegate.swift                # FCM, push, etc.
│   ├── Core/
│   │   ├── Network/                         # URLSession + endpoints
│   │   ├── Storage/                         # Core Data + UserDefaults
│   │   └── DI/                              # Manual DI containers
│   ├── Domain/
│   │   ├── Models/                          # Domain entities
│   │   ├── UseCases/                        # Business logic
│   │   └── Repositories/                    # Protocols
│   ├── Data/
│   │   └── Repositories/                    # Implementations
│   ├── Presentation/
│   │   ├── Theme/                           # Wakaman design tokens
│   │   ├── Components/                      # Reusable SwiftUI views
│   │   └── Features/
│   │       └── <Feature>/
│   │           ├── <Feature>View.swift      # SwiftUI View
│   │           ├── <Feature>ViewModel.swift # @MainActor ObservableObject
│   │           └── <Feature>UIState.swift
│   └── Resources/
│       └── Localizable.strings              # i18n (fr.lproj, en.lproj)
└── Tests/
```

## Architecture MVVM avec ObservableObject

```swift
@MainActor
final class OrderViewModel: ObservableObject {
    enum UIState {
        case loading
        case loaded(Order)
        case error(String)
    }

    @Published private(set) var state: UIState = .loading

    private let getOrderUseCase: GetOrderUseCase

    init(getOrderUseCase: GetOrderUseCase) {
        self.getOrderUseCase = getOrderUseCase
    }

    func loadOrder(id: String) async {
        state = .loading
        do {
            let order = try await getOrderUseCase.execute(id: id)
            state = .loaded(order)
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}
```

## Conventions SwiftUI

- 1 fichier par View : `<Feature>View.swift`
- Pas de logique métier dans les Views (déléguer au ViewModel)
- Utiliser `@StateObject` pour créer un VM, `@ObservedObject` pour le recevoir
- Préférer les composants du **design system** : `WakamanButton`, `WakamanCard`, etc.
- Couleurs : `Color.wakaman.orange`, `Color.wakaman.dark` (extension custom)
- Espacements : `Spacing.small`, `Spacing.medium`, `Spacing.large`

## Réseau (URLSession + async/await)

```swift
protocol OrdersAPI {
    func getOrder(id: String) async throws -> Order
    func createOrder(_ request: CreateOrderRequest) async throws -> Order
}

actor OrdersAPIClient: OrdersAPI {
    private let baseURL = URL(string: Environment.apiBaseURL)!
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func getOrder(id: String) async throws -> Order {
        let url = baseURL.appending(path: "orders/\(id)")
        let (data, response) = try await session.data(from: url)
        try validateResponse(response)
        return try JSONDecoder.wakaman.decode(Order.self, from: data)
    }
}
```

- Toutes les fonctions réseau en `async throws`
- Erreurs custom : `enum WakamanAPIError: Error { case network, decoding, server(Int) }`
- Retry automatique sur 5xx (3 tentatives avec backoff exponentiel)
- Timeout : 30s par défaut

## Background Tasks

```swift
import BackgroundTasks

// Pour la synchro périodique du marchand
BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.wakaman.merchant.sync",
    using: nil
) { task in
    Task { await handleBackgroundSync(task: task as! BGAppRefreshTask) }
}
```

## Tests

- **Unit tests** : `XCTest` + mocks via protocols
- **Snapshot tests** : `swift-snapshot-testing` pour les vues critiques
- **UI tests** : `XCUITest` sur les flux principaux

## Performance

- App < 50 Mo (acceptable iOS)
- Démarrage à froid < 1.5s
- Lazy loading des images avec `AsyncImage` + cache
- Profiling régulier avec Instruments

## Sécurité

- Secrets dans `.xcconfig` + Configuration files (jamais dans le code)
- App Transport Security activé (HTTPS only)
- Keychain pour tokens sensibles (jamais UserDefaults pour ça)
- Biometric auth (Face ID / Touch ID) pour actions sensibles
- Certificate pinning en production

## Distribution

- TestFlight pour beta (50 testeurs internes + 200 externes)
- App Store Connect pour release
- Versioning : SemVer (1.0.0)
- Build number : auto-incrémenté par CI

## Conventions générales

- Naming : `camelCase` pour variables/fonctions, `PascalCase` pour types
- Pas de `force unwrapping` (`!`) sauf cas justifiés et commentés
- Préférer `guard let` à `if let` quand possible
- Documenter les API publiques avec `///` (DocC compatible)
- SwiftLint activé avec config Wakaman
