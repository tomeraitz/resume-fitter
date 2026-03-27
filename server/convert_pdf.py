import fitz  # PyMuPDF
import sys
import base64
import math

# Read PDF from stdin (binary) or from file path argument
if len(sys.argv) > 1:
    pdf_path = sys.argv[1]
    doc = fitz.open(pdf_path)
else:
    pdf_data = sys.stdin.buffer.read()
    doc = fitz.open(stream=pdf_data, filetype="pdf")
page = doc[0]

# Get page dimensions
rect = page.rect
width = rect.width
height = rect.height

# Extract images
images_html = []
for img_index, img in enumerate(page.get_images(full=True)):
    xref = img[0]
    pix = fitz.Pixmap(doc, xref)
    if pix.n - pix.alpha > 3:  # CMYK
        pix = fitz.Pixmap(fitz.csRGB, pix)
    img_data = pix.tobytes("png")
    b64 = base64.b64encode(img_data).decode()

    # Get image placement on page
    img_rects = page.get_image_rects(img[7])  # use image name
    for r in img_rects:
        images_html.append(
            f'<img src="data:image/png;base64,{b64}" '
            f'style="position:absolute; left:{r.x0}px; top:{r.y0}px; '
            f'width:{r.width}px; height:{r.height}px;" />'
        )

# Extract drawings (vector graphics - lines, rects, etc.)
drawings_html = []
paths = page.get_drawings()
for path in paths:
    for item in path["items"]:
        if item[0] == "re":  # rectangle
            r = item[1]
            fill = path.get("fill")
            stroke = path.get("color")
            fill_css = ""
            if fill:
                fill_css = f"background:rgb({int(fill[0]*255)},{int(fill[1]*255)},{int(fill[2]*255)});"
            stroke_css = ""
            if stroke:
                stroke_css = f"border:1px solid rgb({int(stroke[0]*255)},{int(stroke[1]*255)},{int(stroke[2]*255)});"
            drawings_html.append(
                f'<div style="position:absolute; left:{r.x0}px; top:{r.y0}px; '
                f'width:{r.width}px; height:{r.height}px; {fill_css} {stroke_css}"></div>'
            )
        elif item[0] == "l":  # line
            p1, p2 = item[1], item[2]
            color = path.get("color", (0, 0, 0))
            w = path.get("width", 1)
            length = ((p2.x - p1.x)**2 + (p2.y - p1.y)**2)**0.5
            angle = math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / math.pi
            drawings_html.append(
                f'<div style="position:absolute; left:{p1.x}px; top:{p1.y}px; '
                f'width:{length}px; height:0; '
                f'border-top:{w}px solid rgb({int(color[0]*255)},{int(color[1]*255)},{int(color[2]*255)}); '
                f'transform-origin:0 0; transform:rotate({angle}deg);"></div>'
            )

# Extract links
links_html = []
for link in page.get_links():
    uri = link.get("uri")
    if not uri:
        continue
    r = link["from"]
    links_html.append(
        f'<a href="{uri}" target="_blank" style="position:absolute; left:{r.x0}px; top:{r.y0}px; '
        f'width:{r.width}px; height:{r.height}px; display:block; z-index:10;"></a>'
    )

# Extract text with detailed positioning
blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
text_html = []

for block in blocks:
    if block["type"] != 0:  # skip image blocks
        continue
    for line in block["lines"]:
        for span in line["spans"]:
            text = span["text"]
            if not text.strip():
                continue

            x = span["origin"][0]
            y = span["origin"][1]
            size = span["size"]
            font = span["font"]
            color = span["color"]
            flags = span["flags"]

            # Convert color int to rgb
            r = (color >> 16) & 0xFF
            g = (color >> 8) & 0xFF
            b = color & 0xFF

            # Font weight and style
            bold = "bold" if flags & 2**4 else "normal"
            italic = "italic" if flags & 2**1 else "normal"

            # Check if this is a Font Awesome icon
            is_fa = "FontAwesome" in font or "Awesome" in font
            is_fa_brands = "Brands" in font

            if is_fa:
                # Map Font Awesome unicode codepoints to FA6 class names
                fa_map = {
                    '\uf095': 'fa-phone',
                    '\uf0e0': 'fa-envelope',
                    '\uf08c': 'fa-linkedin',
                    '\uf0ac': 'fa-globe',
                    '\uf007': 'fa-user',
                    '\uf0b1': 'fa-briefcase',
                    '\uf19d': 'fa-graduation-cap',
                    '\uf0a1': 'fa-bullhorn',
                    '\uf015': 'fa-home',
                    '\uf041': 'fa-map-marker',
                    '\uf0c0': 'fa-users',
                    '\uf02d': 'fa-book',
                    '\uf013': 'fa-cog',
                    '\uf058': 'fa-check-circle',
                    '\uf005': 'fa-star',
                }
                for char in text:
                    fa_class = fa_map.get(char, '')
                    fa_prefix = 'fa-brands' if is_fa_brands else 'fa-solid'
                    if fa_class:
                        text_html.append(
                            f'<i class="{fa_prefix} {fa_class}" style="position:absolute; left:{x:.2f}px; top:{y - size * 0.85:.2f}px; '
                            f'font-size:{size:.2f}px; color:rgb({r},{g},{b}); line-height:1;"></i>'
                        )
                    else:
                        # Fallback: render the unicode char with FA font
                        text_html.append(
                            f'<i class="{fa_prefix}" style="position:absolute; left:{x:.2f}px; top:{y - size * 0.85:.2f}px; '
                            f'font-size:{size:.2f}px; color:rgb({r},{g},{b}); line-height:1;">&#x{ord(char):04x};</i>'
                        )
                continue

            # Map PDF fonts to web fonts
            font_family = "'Segoe UI', Arial, Helvetica, sans-serif"
            if "poppins" in font.lower():
                font_family = "'Poppins', Arial, Helvetica, sans-serif"
            elif "serif" in font.lower() and "sans" not in font.lower():
                font_family = "Georgia, 'Times New Roman', serif"
            elif "mono" in font.lower() or "courier" in font.lower():
                font_family = "'Courier New', monospace"

            # Detect semibold
            if "semibold" in font.lower():
                bold = "600"

            # Use baseline positioning (origin is baseline in PDF)
            text_html.append(
                f'<span style="position:absolute; left:{x:.2f}px; top:{y - size * 0.85:.2f}px; '
                f'font-size:{size:.2f}px; font-family:{font_family}; '
                f'font-weight:{bold}; font-style:{italic}; '
                f'color:rgb({r},{g},{b}); white-space:pre; line-height:1;">'
                f'{text.replace("<", "&lt;").replace(">", "&gt;").replace("&", "&amp;")}</span>'
            )

# Build final HTML
html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Tomer Raitz - CV</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page {{ size: {width}px {height}px; margin: 0; }}
  body {{
    margin: 0;
    padding: 0;
    background: #f0f0f0;
  }}
  .page {{
    position: relative;
    width: {width}px;
    height: {height}px;
    margin: 20px auto;
    background: white;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    overflow: hidden;
  }}
  @media print {{
    body {{ background: white; }}
    .page {{ margin: 0; box-shadow: none; }}
  }}
</style>
</head>
<body>
<div class="page">
{''.join(drawings_html)}
{''.join(images_html)}
{''.join(text_html)}
{''.join(links_html)}
</div>
</body>
</html>"""

sys.stdout.reconfigure(encoding='utf-8')
sys.stdout.write(html)
doc.close()
