import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer"; // Para manejar archivos
import fs from "fs/promises"; // Para manejar el sistema de archivos con promesas
import path from "path";
import { fileURLToPath } from "url";
import { Ollama } from "ollama";
import { v4 as uuidv4 } from "uuid"; // Para generar nombres únicos
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { exec } from 'child_process';

// Configuración de __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ollama = new Ollama();
const app = express();
const port = 5000;

// Definir la ruta para almacenar currentModel.txt
const dataDir = path.join(__dirname, 'data');
const currentModelPath = path.join(dataDir, 'currentModel.txt');

// Variable para almacenar el nombre del modelo actual
let currentModelName = null;

// Configuración de multer para manejar la subida de archivos
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Función para leer el modelo actual desde el archivo
const loadCurrentModel = async () => {
  try {
    // Verificar si el archivo existe
    await fs.access(currentModelPath);
    // Leer el contenido del archivo
    const modelName = await fs.readFile(currentModelPath, 'utf8');
    currentModelName = modelName.trim();
    console.log(`Modelo actual cargado: ${currentModelName}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // El archivo no existe, no hay modelo actual
      console.log("No se encontró 'currentModel.txt'. Se creará al subir un nuevo modelo.");
    } else {
      console.error("Error al cargar el modelo actual:", error);
    }
  }
};

// Función para guardar el modelo actual en el archivo
const saveCurrentModel = async (modelName) => {
  try {
    // Asegurarse de que el directorio data existe
    await fs.mkdir(dataDir, { recursive: true });
    // Escribir el nombre del modelo en el archivo
    await fs.writeFile(currentModelPath, modelName, 'utf8');
    console.log(`Modelo actual guardado: ${modelName}`);
  } catch (error) {
    console.error("Error al guardar el modelo actual:", error);
    throw error;
  }
};

// Cargar el modelo actual al iniciar el servidor
loadCurrentModel();

// Configuración de Swagger
const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "API de la Inteligencia Artificial",
      version: "1.0.0",
      description: "Documentación de la API para el manejo de modelos y generación de respuestas usando Inteligencia Artificial",
    },
    servers: [
      {
        url: `http://localhost:${port}`,
      },
    ],
  },
  apis: ["./index.js"], // Aquí se refiere al archivo donde están tus endpoints
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /:
 *   get:
 *     summary: Verificar si el servidor está en línea
 *     responses:
 *       200:
 *         description: El servidor está en línea
 */
app.get("/", (req, res) => {
  res.send("Servidor en línea");
});

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Subir un archivo .txt y crear un nuevo modelo
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: uploadModelFile
 *         type: file
 *         description: Archivo .txt para crear el modelfile
 *         required: true
 *     responses:
 *       200:
 *         description: Modelo creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 modelName:
 *                   type: string
 *       400:
 *         description: No se ha subido ningún archivo
 *       500:
 *         description: Ocurrió un error al crear el modelo
 */
app.post("/uploadModelFile", upload.single('modelfile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: "No se ha subido ningún archivo." });
    }

    const filePath = req.file.path;

    // Leer el contenido del archivo subido
    const modelfileContent = await fs.readFile(filePath, 'utf8');

    // Generar un nombre único para el nuevo modelo
    const newModelName = `model-${uuidv4()}`;

    // Si existe un modelo anterior, elimínalo
    if (currentModelName) {
      try {
        await ollama.delete({ model: currentModelName });
        console.log(`Modelo anterior "${currentModelName}" eliminado.`);
      } catch (deleteError) {
        console.error(`Error al eliminar el modelo anterior: ${deleteError.message}`);
        // Opcional: Puedes decidir si continuar o no dependiendo del error
      }
    }

    // Crear el nuevo modelo con el contenido del archivo .txt
    await ollama.create({ model: newModelName, modelfile: modelfileContent });

    // Actualizar el nombre del modelo actual
    currentModelName = newModelName;

    // Guardar el nombre del modelo actual en el archivo
    await saveCurrentModel(newModelName);

    // Eliminar el archivo subido después de procesarlo
    await fs.unlink(filePath);

    res.send({ message: "Modelo creado exitosamente.", modelName: newModelName });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Ocurrió un error al crear el modelo." });
  }
});

/**
 * @swagger
 * /prompt:
 *   post:
 *     summary: Generar una respuesta usando el modelo actual
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: La pregunta o prompt para generar la respuesta
 *     responses:
 *       200:
 *         description: Respuesta generada por el modelo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *       400:
 *         description: No hay ningún modelo disponible o el prompt está vacío
 *       500:
 *         description: Ocurrió un error al generar la respuesta
 */
app.post("/prompt", async (req, res) => {
  try {
    if (!currentModelName) {
      return res.status(400).send({ error: "No hay ningún modelo disponible. Sube un modelo primero." });
    }

    const prompt = req.body.prompt;
    if (!prompt) {
      return res.status(400).send({ error: "El campo 'prompt' es requerido." });
    }

    const response = await ollama.generate({ model: currentModelName, prompt, stream: true });
    let completeResponse = "";

    for await (const part of response) {
      completeResponse += part.response;
      process.stdout.write(part.response)
    }

    res.send({ response: completeResponse });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Ocurrió un error al generar la respuesta." });
  }
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
  console.log(`Documentación de la API disponible en http://localhost:${port}/api-docs`);
});
