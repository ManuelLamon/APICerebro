# API Cerebro

### Instala Ollama

```
curl -fsSL https://ollama.com/install.sh | sh
```

### Instala llama 3.2
```
ollama run llama3.2
```

### Instalas los paquetes
```
npm i
```

### Correr desarrollo
```
npm run dev
```

### Comunicarse con el prompt
```
curl -X POST -H "Content-Type: application/json" -d '{"prompt":"¿Cuál es la capital de Francia?"}' http://localhost:5000/prompt
```
## Entorno de producción

### Instalar PM2
```
npm install -g pm2
```
### Verificar Instalación PM2
```
pm2 -v
```

### Correr producción
```
pm2 start index.js --name "APICerebro"
```