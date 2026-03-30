export const MOCK_NEW_PRICING_WIDGET = {
  "id": "expedition_luxury_tourism_v3",
  "name": "Expedition Luxury Tourism",
  "category": "Lifestyle",
  "tag": "Tourism",
  "image": "",
  "config_json": {
    "theme": {
      "font": "'Inter', sans-serif",
      "fontDisplay": "'Playfair Display', serif",
      "animation": "fade-up"
    },
    "layout": {
      "type": "row",
      "height": "640px",
      "minHeight": "640px",
      "gap": "xl",
      "padding": "2xl xl",
      "mobileStack": true,
      "mobilePadding": "lg md",
      "align": "stretch",
      "children": [
        {
          "type": "photo-card",
          "flex": 1,
          "height": "640px",
          "bgImage": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
          "objectPosition": "center center",
          "borderRadius": "24px",
          "children": [
            { "type": "overlay", "gradient": "linear-gradient(to bottom, rgba(0,0,0,0) 20%, rgba(0,0,0,0.9) 100%)" },
            {
              "type": "absolute",
              "top": "0", "left": "0", "right": "0", "bottom": "0",
              "padding": "xl",
              "zIndex": 2,
              "children": [
                {
                  "type": "column",
                  "height": "100%",
                  "children": [
                    { "type": "badge", "text": "COASTAL ESCAPE", "color": "rgba(255,255,255,0.15)", "textColor": "#ffffff", "pill": true, "marginBottom": "md" },
                    { "type": "text", "value": "Maldives Azure", "fontFamily": "var(--font-display)", "size": 42, "weight": 700, "color": "#ffffff", "lineHeight": 1.1, "marginBottom": "sm" },
                    { "type": "text", "value": "7 Nights of overwater bungalow luxury with private chef service.", "size": 16, "color": "rgba(255,255,255,0.7)", "lineHeight": 1.5 },
                    { "type": "spacer" },
                    { "type": "price-block", "style": "stacked-currency", "currency": "$", "amount": "4,990", "period": "pp", "color": "#ffffff", "size": 1.1 },
                    { "type": "spacer", "size": 16 },
                    { "type": "button", "text": "Book Discovery", "variant": "white", "color": "#000000", "fullWidth": true, "size": "lg", "borderRadius": 12 }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "photo-card",
          "flex": 1,
          "height": "640px",
          "bgImage": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800",
          "objectPosition": "center center",
          "borderRadius": "24px",
          "children": [
            { "type": "overlay", "gradient": "linear-gradient(to bottom, rgba(0,0,0,0) 20%, rgba(0,0,0,0.9) 100%)" },
            {
              "type": "absolute",
              "top": "0", "left": "0", "right": "0", "bottom": "0",
              "padding": "xl",
              "zIndex": 2,
              "children": [
                {
                  "type": "column",
                  "height": "100%",
                  "children": [
                    { "type": "badge", "text": "ALPINE SUMMIT", "color": "#fbbf24", "textColor": "#000000", "pill": true, "marginBottom": "md" },
                    { "type": "text", "value": "Swiss Peaks", "fontFamily": "var(--font-display)", "size": 42, "weight": 700, "color": "#ffffff", "lineHeight": 1.1, "marginBottom": "sm" },
                    { "type": "text", "value": "Helicopter transfers and exclusive chalet access in St. Moritz.", "size": 16, "color": "rgba(255,255,255,0.7)", "lineHeight": 1.5 },
                    { "type": "spacer" },
                    { "type": "price-block", "style": "stacked-currency", "currency": "$", "amount": "6,200", "period": "pp", "color": "#ffffff", "size": 1.1 },
                    { "type": "spacer", "size": 16 },
                    { "type": "button", "text": "Reserve Peak", "variant": "solid", "color": "#fbbf24", "textColor": "#000000", "fullWidth": true, "size": "lg", "borderRadius": 12 }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "photo-card",
          "flex": 1,
          "height": "640px",
          "bgImage": "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800",
          "objectPosition": "center center",
          "borderRadius": "24px",
          "children": [
            { "type": "overlay", "gradient": "linear-gradient(to bottom, rgba(0,0,0,0) 20%, rgba(0,0,0,0.9) 100%)" },
            {
              "type": "absolute",
              "top": "0", "left": "0", "right": "0", "bottom": "0",
              "padding": "xl",
              "zIndex": 2,
              "children": [
                {
                  "type": "column",
                  "height": "100%",
                  "children": [
                    { "type": "badge", "text": "CULTURAL HERITAGE", "color": "rgba(255,255,255,0.15)", "textColor": "#ffffff", "pill": true, "marginBottom": "md" },
                    { "type": "text", "value": "Tuscan Sun", "fontFamily": "var(--font-display)", "size": 42, "weight": 700, "color": "#ffffff", "lineHeight": 1.1, "marginBottom": "sm" },
                    { "type": "text", "value": "Private vineyard tours and historical villa stays in the heart of Italy.", "size": 16, "color": "rgba(255,255,255,0.7)", "lineHeight": 1.5 },
                    { "type": "spacer" },
                    { "type": "price-block", "style": "stacked-currency", "currency": "$", "amount": "3,850", "period": "pp", "color": "#ffffff", "size": 1.1 },
                    { "type": "spacer", "size": 16 },
                    { "type": "button", "text": "Begin Journey", "variant": "white", "color": "#000000", "fullWidth": true, "size": "lg", "borderRadius": 12 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    "plans": []
  }
}