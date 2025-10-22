import swaggerJSDoc from 'swagger-jsdoc';
import config from './config';
import path from 'path';
import fs from 'fs';

// Determine if we're running on Vercel
const isVercel = process.env.VERCEL === '1';

// Define the tag interface
interface SwaggerTag {
  name: string;
  description: string;
}

// Function to load and parse JSON files
const loadSwaggerJson = (filePath: string): any => {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error loading Swagger JSON file ${filePath}:`, error);
    return {};
  }
};

// Get the directories for Swagger JSON files
const swaggerDir = path.join(__dirname, 'swagger');
const swaggerPathsDir = path.join(__dirname, 'swagger/paths');

// Load the main API documentation file
const loadApiDocs = (): any => {
  try {
    const apiDocsPath = path.join(swaggerDir, 'api-docs.json');
    if (fs.existsSync(apiDocsPath)) {
      return loadSwaggerJson(apiDocsPath);
    }
    return {};
  } catch (error) {
    console.error('Error loading API docs:', error);
    return {};
  }
};

// Load all path files from the paths directory
const loadAllPaths = (): Record<string, any> => {
  let result: Record<string, any> = {};

  try {
    // Check if directory exists
    if (!fs.existsSync(swaggerPathsDir)) {
      console.error(`Swagger paths directory does not exist: ${swaggerPathsDir}`);
      return result;
    }
    
    // Get all JSON files in the swagger/paths directory
    const files = fs.readdirSync(swaggerPathsDir).filter(file => file.endsWith('.json'));
    
    // Process each file
    for (const file of files) {
      const filePath = path.join(swaggerPathsDir, file);
      const content = loadSwaggerJson(filePath);
      
      // Merge paths
      result = { ...result, ...content };
    }
    
    return result;
  } catch (error) {
    console.error('Error loading Swagger path files:', error);
    return result;
  }
};

// Create the base Swagger definition
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Dawn Sign Press API Documentation',
    version: '1.0.0',
    description: 'API documentation for Dawn Sign Press backend services'
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'sb-auth-token'
      }
    }
  },
  security: [
    {
      cookieAuth: []
    }
  ]
};

// Load API documentation from JSON files
const apiDocs = loadApiDocs();
const paths = loadAllPaths();

// Merge the base definition with the loaded content
const mergedDefinition = {
  ...swaggerDefinition,
  tags: apiDocs.tags || [],
  paths: paths,
  components: {
    ...swaggerDefinition.components,
    schemas: apiDocs.components?.schemas || {}
  }
};

// Create the Swagger spec
const swaggerSpec = mergedDefinition;

// Ensure servers section is removed
if (swaggerSpec && typeof swaggerSpec === 'object' && 'servers' in swaggerSpec) {
  delete (swaggerSpec as any).servers;
}

// Log a summary of the Swagger spec
console.log('Swagger documentation loaded successfully');

export default swaggerSpec;
