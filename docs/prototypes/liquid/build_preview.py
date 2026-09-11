"""Rebuild the self-contained design preview from its first concept and revision."""
from pathlib import Path
import base64

HERE = Path(__file__).resolve().parent
base = (HERE / "habits-liquid-v1.html").read_text()
previous_tabs = "const tabs=[['daily','sun','Daily'],['train','dumbbell','Train'],['speak','audio-lines','Speak'],['north','sparkles','North'],['food','utensils','Food'],['me','user-round','Me']];"
current_tabs = "const tabs=[['daily','sun','Daily'],['north','sparkles','North'],['train','dumbbell','Train'],['speak','audio-lines','Speak'],['food','utensils','Food'],['me','user-round','Me']];"
assert previous_tabs in base
base = base.replace(previous_tabs, current_tabs, 1)
css = (HERE / "north-star-v2.css").read_text()
js = (HERE / "north-star-v2.js").read_text()
css += "\n" + (HERE / "training-program.css").read_text()
program_js = (HERE / "training-program.js").read_text()
program_js = program_js.replace("__PROGRAM_DATA__", (HERE / "assets/program-preview-data.json").read_text())
js += "\n" + program_js
css += "\n" + (HERE / "craft-refinements.css").read_text()
js += "\n" + (HERE / "craft-refinements.js").read_text()
photo = base64.b64encode((HERE / "assets/aurora-north-star.jpg").read_bytes()).decode()
js = js.replace("__AURORA_DATA__", "data:image/jpeg;base64," + photo)
base = base.replace("</style>", css + "\n</style>", 1)
base = base.replace("<script>", '<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>\n<script>', 1)
base = base.replace("render(false);\nif(globalThis.Tweak)", js + "\nrender(false);\nif(globalThis.Tweak)", 1)
base = base.replace("if(target.hasAttribute('data-hold')&&e.target.closest('button'))return;", "if(target.hasAttribute('data-hold')&&e.target.closest('button')&&e.target.closest('button')!==target)return;")
base = base.replace("tweak.addToggle(design,'sculpture',{label:'Sculptural highlights'});", "tweak.addToggle(design,'aurora',{label:'Aurora motion'});tweak.addSelect(design,'hero',{label:'Aurora framing',options:[{label:'Immersive',value:'immersive'},{label:'Compact',value:'compact'}]});tweak.addToggle(design,'cues',{label:'Show haptic cues'});")
base = base.replace("if(Math.abs(g.dx)>Math.abs(g.dy)&&Math.abs(g.dx)>8){", "if((g.target.dataset.habit!==undefined||g.target.dataset.deck)&&Math.abs(g.dx)>Math.abs(g.dy)&&Math.abs(g.dx)>8){")
assert "__AURORA_DATA__" not in base
assert len(base.encode()) < 1_000_000
(HERE / "habits-liquid.html").write_text(base)
print(f"Rebuilt preview: {len(base.encode()):,} bytes")
