# Runtime stage (use pre-built dist for now - Docker build has Tailwind issue)
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy pre-built frontend (build locally with: cd frontend && npm run build)
COPY dist /usr/share/nginx/html

# Expose port 5173 (Vite default)
EXPOSE 5173

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
