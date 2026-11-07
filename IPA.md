# IPA для iPhone

Workflow [Build IPA](https://github.com/yoyovich/AlphaArc/actions/workflows/ipa.yml)
собирает Release для **iphoneos / arm64**, проверяет платформу, архитектуру и Info.plist,
упаковывает `Payload/SailBrowser.app` и сохраняет `AlphaArc-unsigned.ipa` в артефакт
`AlphaArc-unsigned-iphoneos` (ZIP с IPA внутри).

Это сборка для физического устройства, не симулятора. **Она не подписана Apple**:
для установки её нужно подписать через AltStore, SideStore, ESign или подходящий
сервис/сертификат. Обычное нажатие на неподписанный IPA на iPhone не установит его.
Нужна iOS 26 или новее.

Конфигурация `iOS/sideload.yml` задаёт имя AlphaArc, ID `com.yoyovich.alphaarc`
и отключает CloudKit/push/default-browser entitlements. Синхронизация вкладок Mac
в этой сборке выключена; браузер, приватные вкладки, cookie, тёмная тема и перевод
сохраняются. Это позволяет инструменту самоподписи использовать свои профили.

На Mac тот же файл можно получить командой из корня:

```sh
iOS/scripts/package-unsigned.sh
```

Для подписанного IPA / TestFlight нужны собственные Apple Developer Team,
сертификат и provisioning profile либо настроенная автоматическая подпись через
App Store Connect. Такие ключи вводятся в GitHub Secrets или настройки среды,
не отправляются в чат. Старый Release workflow upstream автоматически не запускается.
