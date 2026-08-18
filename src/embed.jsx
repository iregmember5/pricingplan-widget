// embed.tsx - Special version for script embeds
import React from 'react';
import ReactDOM from 'react-dom/client';

function getSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug');
}

const slug = getSlug();

if (slug) {
  // Look for existing container in parent page
  let container = document.getElementById(`widget-${slug}`);
 
  if (!container) {
    // Create container in parent document
    container = document.createElement('div');
    container.id = `widget-${slug}`;
    document.body.appendChild(container);
  }

  // Import and render your widget
  import('./Widget').then(({ default: Widget }) => {
    const root = ReactDOM.createRoot(container);
    root.render(<Widget widgetId={slug} />);
  });
}