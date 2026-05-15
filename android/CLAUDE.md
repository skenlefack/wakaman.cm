# Wakaman Android — Conventions Kotlin

## Stack

- **Langage** : Kotlin 2.0+
- **UI** : Jetpack Compose
- **Architecture** : MVVM + Clean Architecture
- **DI** : Hilt
- **Async** : Coroutines + Flow
- **Réseau** : Retrofit + OkHttp + Kotlinx Serialization
- **Persistance** : Room
- **Cartographie** : Mapbox Android SDK
- **Background** : WorkManager + Foreground Services (pour app coursier)
- **Push** : Firebase Cloud Messaging

## 3 apps Android

| App | Module | Particularités |
|---|---|---|
| **app-client** | Client final | Standard, focus UX premium |
| **app-courier** | Coursier | **Foreground service GPS critique**, mode offline robuste |
| **app-merchant** | Marchand (restaurant, boutique) | Tablette + mobile, notif fortes |

## Structure par app

```
app-<type>/
├── src/main/java/com/wakaman/<type>/
│   ├── WakamanApp.kt                    # @HiltAndroidApp
│   ├── MainActivity.kt                   # ComponentActivity unique
│   ├── data/
│   │   ├── remote/                       # Retrofit API + DTOs
│   │   ├── local/                        # Room DAOs + entities
│   │   └── repository/                   # Repositories
│   ├── domain/
│   │   ├── model/                        # Domain models
│   │   ├── usecase/                      # Use cases (interactors)
│   │   └── repository/                   # Repository interfaces
│   ├── presentation/
│   │   ├── theme/                        # Compose theme Wakaman
│   │   ├── components/                   # UI réutilisables
│   │   └── feature/<feature>/
│   │       ├── <Feature>Screen.kt        # @Composable
│   │       ├── <Feature>ViewModel.kt     # @HiltViewModel
│   │       └── <Feature>UiState.kt       # Sealed class
│   └── di/                               # Hilt modules
└── src/main/res/
    └── values/
        └── strings.xml                   # i18n (fr + en)
```

## Architecture MVVM avec StateFlow

```kotlin
@HiltViewModel
class OrderViewModel @Inject constructor(
    private val getOrderUseCase: GetOrderUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow<OrderUiState>(OrderUiState.Loading)
    val uiState: StateFlow<OrderUiState> = _uiState.asStateFlow()

    fun loadOrder(id: String) {
        viewModelScope.launch {
            getOrderUseCase(id)
                .onSuccess { _uiState.value = OrderUiState.Success(it) }
                .onFailure { _uiState.value = OrderUiState.Error(it.message ?: "Unknown error") }
        }
    }
}

sealed interface OrderUiState {
    data object Loading : OrderUiState
    data class Success(val order: Order) : OrderUiState
    data class Error(val message: String) : OrderUiState
}
```

## Conventions Compose

- 1 fichier par écran : `<Feature>Screen.kt`
- Pas de logique métier dans les Composables (déléguer au ViewModel)
- Préférer `remember` + `derivedStateOf` pour les calculs UI
- Utiliser le **design system** dans `shared/design-system/`
- Couleurs : utiliser `WakamanTheme.colors` (orange #F5A623, noir, etc.)
- Tailles : utiliser `WakamanTheme.dimensions` (pas de magic numbers)

## App Coursier — règles spécifiques

### Foreground Service GPS

```kotlin
class TrackingService : Service() {
    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, createNotification())
        startLocationUpdates()
    }
}
```

- Le service DOIT être un **foreground service** (sinon Android le tue)
- Notification persistante pendant les courses
- Optimisation batterie : intervalle 5s en course, 30s en idle
- Stockage local de toutes les positions (sync différée)

### Mode offline robuste

- Toutes les actions (acceptation, ramassage, livraison) doivent fonctionner offline
- File d'attente locale (Room) avec WorkManager pour la synchro
- Indicateur visuel clair quand offline

## Réseau (Retrofit)

```kotlin
interface OrdersApi {
    @GET("orders/{id}")
    suspend fun getOrder(@Path("id") id: String): OrderResponse

    @POST("orders")
    suspend fun createOrder(@Body request: CreateOrderRequest): OrderResponse
}
```

- Suspend functions partout (jamais de callbacks)
- Erreurs gérées via `Result<T>` ou sealed classes custom
- Retry automatique sur 5xx (3 tentatives avec backoff)
- Timeout : 30s par défaut

## Tests

- **Unit tests** : ViewModels + UseCases avec `Turbine` pour StateFlow
- **UI tests** : Compose UI Test avec `ComposeTestRule`
- **Snapshot tests** : Paparazzi pour les composants critiques

## Performance

- App < 30 Mo (taille critique pour les utilisateurs camerounais)
- Démarrage à froid < 2s sur Tecno Spark / Itel
- Pas de blocking sur main thread
- Images : compression WebP + lazy loading avec Coil

## Sécurité

- Pas de hardcoded secrets (utiliser BuildConfig + .env)
- Network Security Config : HTTPS only
- Certificate pinning sur l'API en production
- ProGuard/R8 activé en release
- Données sensibles dans EncryptedSharedPreferences
