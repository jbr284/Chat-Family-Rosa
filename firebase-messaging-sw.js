importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAB3KCfomPt3TAtV9mL4lx393TaMhNA5tY",
  projectId: "chat-family-rosa",
  messagingSenderId: "237093132146",
  appId: "1:237093132146:web:280b9c3a36f1bff6672feb"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Notificação Background:', payload);
  
  const notificationTitle = payload.notification.title;
  
  // CORREÇÃO AQUI: 
  // 1. Verifica se 'data' existe.
  // 2. Se não, tenta pegar do 'fcmOptions' (que o log mostrou que tem).
  // 3. Se falhar tudo, usa a raiz do site (self.location.origin).
  let linkDestino = self.location.origin; // Padrão
  
  if (payload.data && payload.data.link) {
      linkDestino = payload.data.link;
  } else if (payload.fcmOptions && payload.fcmOptions.link) {
      linkDestino = payload.fcmOptions.link;
  }

  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/1244/1244696.png',
    data: { url: linkDestino } // Passa o link seguro
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Ação ao clicar: Focar na aba aberta ou abrir nova
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        // Tenta encontrar uma aba que já esteja nesse site
        for (let i = 0; i < clientList.length; i++) {
            const client = clientList[i];
            // Se achar, foca nela
            if (client.url.includes(self.location.origin) && 'focus' in client) {
                return client.focus();
            }
        }
        // Se não achar, abre uma nova com o link da notificação
        if (clients.openWindow && event.notification.data.url) {
            return clients.openWindow(event.notification.data.url);
        }
    })
  );
});
