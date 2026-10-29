class_name IslaGameUI
extends CanvasLayer

const MAP_VIEW := preload("res://scripts/map_view.gd")
var main: IslaMain
var root: Control
var hud: Control
var menu_panel: PanelContainer
var pause_panel: PanelContainer
var inventory_panel: PanelContainer
var map_panel: PanelContainer
var death_panel: PanelContainer
var bars: Dictionary = {}
var stat_labels: Dictionary = {}
var hotbar_buttons: Array[Button] = []
var inventory_grid: GridContainer
var recipe_list: VBoxContainer
var recipe_status: Label
var map_view: IslaMapView
var message_label: Label
var target_label: Label
var music: AudioStreamPlayer
var blocks_gameplay: bool = true
var game_started: bool = false
var current_menu: String = "menu"
var touch_layer: Control
var touch_look_active: bool = false

func configure(owner: IslaMain) -> void:
	main = owner

func _ready() -> void:
	add_to_group("game_ui")
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_build_hud()
	_build_menu()
	_build_pause()
	_build_inventory()
	_build_map()
	_build_death()
	_build_touch_controls()
	hud.visible = false
	music = AudioStreamPlayer.new()
	music.name = "Música de título"
	var stream := load("res://assets/audio/temita.mp3")
	if stream is AudioStream:
		music.stream = stream
		music.volume_db = -9.0
		add_child(music)
	GameState.inventory_changed.connect(refresh_inventory)
	GameState.stats_changed.connect(refresh_stats)
	GameState.message_changed.connect(_set_message)
	GameState.game_over.connect(show_death)
	refresh_stats()
	refresh_inventory()

func _process(delta: float) -> void:
	if map_panel.visible and map_view != null:
		map_view.refresh()
	if target_label != null and main != null and main.world != null:
		if main.world.nearest_creature != null:
			target_label.text = main.world.nearest_creature.get_prompt()
		elif not main.world.nearest_target.is_empty():
			var type: String = main.world.nearest_target.get("type", "recurso")
			target_label.text = "E · Recoger" if type == "baya" or type == "ambar_node" else "Clic · Golpear"
		else:
			target_label.text = ""

func _build_hud() -> void:
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)
	var stats_box := VBoxContainer.new()
	stats_box.position = Vector2(22, 18)
	stats_box.size = Vector2(270, 190)
	hud.add_child(stats_box)
	for key in ["vida", "hambre", "sed", "energia", "oxigeno", "sueno", "mojado"]:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = key.capitalize()
		label.custom_minimum_size.x = 84
		label.add_theme_color_override("font_color", Color(0.93, 0.91, 0.82))
		row.add_child(label)
		var bar := ProgressBar.new()
		bar.custom_minimum_size = Vector2(165, 18)
		bar.max_value = 100.0
		bar.show_percentage = false
		bar.add_theme_stylebox_override("background", _style(Color(0.02, 0.03, 0.025, 0.74), 5))
		bar.add_theme_stylebox_override("fill", _style(_stat_color(key), 5))
		row.add_child(bar)
		var value := Label.new()
		value.custom_minimum_size.x = 38
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(value)
		stats_box.add_child(row)
		bars[key] = bar
		stat_labels[key] = value
	var crosshair := Label.new()
	crosshair.text = "+"
	crosshair.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	crosshair.position = Vector2(-8, -15)
	crosshair.add_theme_font_size_override("font_size", 28)
	crosshair.add_theme_color_override("font_color", Color(1, 1, 1, 0.78))
	hud.add_child(crosshair)
	message_label = Label.new()
	message_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	message_label.position = Vector2(-320, -112)
	message_label.size = Vector2(640, 40)
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label.add_theme_font_size_override("font_size", 20)
	message_label.add_theme_color_override("font_color", Color(1, 0.91, 0.65))
	hud.add_child(message_label)
	target_label = Label.new()
	target_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	target_label.position = Vector2(-330, -68)
	target_label.size = Vector2(660, 34)
	target_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	target_label.add_theme_font_size_override("font_size", 18)
	target_label.add_theme_color_override("font_color", Color(0.92, 0.93, 0.83))
	hud.add_child(target_label)
	var hints := Label.new()
	hints.text = "WASD mover · Mayús correr · Ctrl agacharse · E interactuar · F usar · Tab mochila · M mapa · Esc pausa"
	hints.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	hints.position = Vector2(-440, -28)
	hints.size = Vector2(880, 24)
	hints.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hints.add_theme_font_size_override("font_size", 13)
	hints.add_theme_color_override("font_color", Color(1, 1, 1, 0.68))
	hud.add_child(hints)
	var bar_bg := PanelContainer.new()
	bar_bg.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	bar_bg.position = Vector2(-272, -78)
	bar_bg.size = Vector2(544, 58)
	bar_bg.add_theme_stylebox_override("panel", _style(Color(0.025, 0.035, 0.028, 0.8), 8))
	hud.add_child(bar_bg)
	var quickbar := HBoxContainer.new()
	quickbar.add_theme_constant_override("separation", 4)
	bar_bg.add_child(quickbar)
	for i in range(GameState.QUICK_SLOTS):
		var button := Button.new()
		button.custom_minimum_size = Vector2(56, 48)
		button.text = str(i + 1)
		button.add_theme_font_size_override("font_size", 12)
		button.pressed.connect(func(): _select_slot(i))
		quickbar.add_child(button)
		hotbar_buttons.append(button)

func _build_menu() -> void:
	menu_panel = _panel_at_center(Vector2(560, 490))
	root.add_child(menu_panel)
	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 14)
	menu_panel.add_child(layout)
	var title := Label.new()
	title.text = "ISLA PRIMORDIAL"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 38)
	title.add_theme_color_override("font_color", Color(0.87, 0.77, 0.5))
	layout.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Una costa perdida entre eras"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 18)
	layout.add_child(subtitle)
	var new_button := _button("Nueva partida")
	new_button.pressed.connect(_start_new_game)
	layout.add_child(new_button)
	var continue_button := _button("Continuar")
	continue_button.disabled = not GameState.has_save()
	continue_button.pressed.connect(_continue_game)
	layout.add_child(continue_button)
	var about := Label.new()
	about.text = "Supervivencia · Recolección · Fauna prehistórica · Fabricación"
	about.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	about.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	layout.add_child(about)
	var controls := Label.new()
	controls.text = "WASD moverse · Espacio saltar · Clic atacar · E interactuar · F usar objeto"
	controls.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	controls.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	controls.add_theme_font_size_override("font_size", 13)
	layout.add_child(controls)

func _build_pause() -> void:
	pause_panel = _panel_at_center(Vector2(390, 290))
	pause_panel.visible = false
	root.add_child(pause_panel)
	var layout := VBoxContainer.new()
	pause_panel.add_child(layout)
	var title := Label.new()
	title.text = "Pausa"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 30)
	layout.add_child(title)
	var resume := _button("Volver al juego")
	resume.pressed.connect(_resume_game)
	layout.add_child(resume)
	var save := _button("Guardar partida")
	save.pressed.connect(func(): GameState.save_game(); GameState.message("Partida guardada."))
	layout.add_child(save)
	var back := _button("Volver al título")
	back.pressed.connect(_return_to_menu)
	layout.add_child(back)

func _build_inventory() -> void:
	inventory_panel = _panel_at_center(Vector2(1020, 620))
	inventory_panel.visible = false
	root.add_child(inventory_panel)
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 22)
	inventory_panel.add_child(columns)
	var left := VBoxContainer.new()
	left.custom_minimum_size.x = 475
	columns.add_child(left)
	var title := Label.new()
	title.text = "Mochila · 30 espacios"
	title.add_theme_font_size_override("font_size", 24)
	left.add_child(title)
	var capacity := Label.new()
	capacity.name = "Capacity"
	left.add_child(capacity)
	inventory_grid = GridContainer.new()
	inventory_grid.columns = 5
	inventory_grid.add_theme_constant_override("h_separation", 4)
	inventory_grid.add_theme_constant_override("v_separation", 4)
	left.add_child(inventory_grid)
	for i in range(GameState.SLOT_COUNT):
		var button := Button.new()
		button.custom_minimum_size = Vector2(88, 58)
		button.clip_text = true
		button.pressed.connect(func(): _select_slot(i))
		inventory_grid.add_child(button)
	var equipment := Label.new()
	equipment.text = "Equipo: cabeza · torso · piernas · pies · espalda"
	equipment.add_theme_font_size_override("font_size", 13)
	left.add_child(equipment)
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(right)
	var craft_title := Label.new()
	craft_title.text = "Fabricación"
	craft_title.add_theme_font_size_override("font_size", 24)
	right.add_child(craft_title)
	recipe_status = Label.new()
	recipe_status.text = "Selecciona una receta."
	recipe_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right.add_child(recipe_status)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(scroll)
	recipe_list = VBoxContainer.new()
	recipe_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(recipe_list)
	var close := _button("Cerrar · Tab")
	close.pressed.connect(toggle_inventory)
	right.add_child(close)

func _build_map() -> void:
	map_panel = _panel_at_center(Vector2(650, 650))
	map_panel.visible = false
	root.add_child(map_panel)
	var layout := VBoxContainer.new()
	map_panel.add_child(layout)
	var title := Label.new()
	title.text = "Mapa del continente · M para cerrar"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 23)
	layout.add_child(title)
	var map_container := Control.new()
	map_container.custom_minimum_size = Vector2(600, 600)
	layout.add_child(map_container)
	map_view = MAP_VIEW.new()
	map_view.configure(main.world)
	map_view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	map_container.add_child(map_view)

func _build_death() -> void:
	death_panel = _panel_at_center(Vector2(500, 330))
	death_panel.visible = false
	root.add_child(death_panel)
	var layout := VBoxContainer.new()
	death_panel.add_child(layout)
	var title := Label.new()
	title.name = "DeathTitle"
	title.text = "Has caído"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 32)
	layout.add_child(title)
	var detail := Label.new()
	detail.name = "DeathDetail"
	detail.text = ""
	detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	layout.add_child(detail)
	var respawn := _button("Despertar en la costa")
	respawn.pressed.connect(_respawn)
	layout.add_child(respawn)
	var menu := _button("Volver al título")
	menu.pressed.connect(_return_to_menu)
	layout.add_child(menu)

func _build_touch_controls() -> void:
	touch_layer = Control.new()
	touch_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	touch_layer.mouse_filter = Control.MOUSE_FILTER_PASS
	touch_layer.visible = DisplayServer.is_touchscreen_available()
	touch_layer.gui_input.connect(_handle_touch_input)
	root.add_child(touch_layer)
	var movement := [
		["↑", "move_forward", Vector2(112, -190)], ["↓", "move_back", Vector2(112, -78)],
		["←", "move_left", Vector2(54, -134)], ["→", "move_right", Vector2(170, -134)],
	]
	for entry in movement:
		_add_touch_button(str(entry[0]), str(entry[1]), Vector2(190, -30) + entry[2])
	_add_touch_action("Golpear", Vector2(-190, -175), func():
		if main.player != null: main.player.attack()
	)
	_add_touch_action("Saltar", Vector2(-92, -122), func(): Input.action_press("jump"); Input.action_release("jump"))
	_add_touch_action("Usar", Vector2(-92, -54), func():
		if main.player != null: main.player.use_selected()
	)
	_add_touch_action("E", Vector2(-188, -70), func():
		if main.player != null: main.player.interact()
	)

func _add_touch_button(text: String, action: String, offset: Vector2) -> void:
	var button := Button.new()
	button.text = text
	button.size = Vector2(62, 62)
	button.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	button.position = offset
	button.button_down.connect(func(): Input.action_press(action))
	button.button_up.connect(func(): Input.action_release(action))
	touch_layer.add_child(button)

func _add_touch_action(text: String, offset: Vector2, callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.size = Vector2(82, 62)
	button.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	button.position = offset
	button.pressed.connect(callback)
	touch_layer.add_child(button)

func _handle_touch_input(event: InputEvent) -> void:
	if not game_started or main == null or main.player == null:
		return
	if event is InputEventScreenTouch:
		touch_look_active = event.pressed and event.position.x >= get_viewport().get_visible_rect().size.x * 0.45
	elif event is InputEventScreenDrag and touch_look_active:
		main.player.apply_look(event.relative)

func toggle_inventory() -> void:
	if not game_started:
		return
	inventory_panel.visible = not inventory_panel.visible
	if inventory_panel.visible:
		_close_other_panels(inventory_panel)
		blocks_gameplay = true
		GameState.pause_game(true)
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		refresh_inventory()
	else:
		_resume_game()

func toggle_map() -> void:
	if not game_started:
		return
	map_panel.visible = not map_panel.visible
	if map_panel.visible:
		_close_other_panels(map_panel)
		blocks_gameplay = true
		GameState.pause_game(true)
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	else:
		_resume_game()

func handle_escape() -> void:
	if not game_started or death_panel.visible:
		return
	if inventory_panel.visible or map_panel.visible:
		inventory_panel.visible = false
		map_panel.visible = false
		_resume_game()
	elif pause_panel.visible:
		_resume_game()
	else:
		pause_panel.visible = true
		blocks_gameplay = true
		GameState.pause_game(true)
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _resume_game() -> void:
	if not game_started:
		return
	menu_panel.visible = false
	pause_panel.visible = false
	inventory_panel.visible = false
	map_panel.visible = false
	death_panel.visible = false
	blocks_gameplay = false
	GameState.pause_game(false)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if DisplayServer.is_touchscreen_available() else Input.MOUSE_MODE_CAPTURED

func _start_new_game() -> void:
	GameState.new_game()
	main.player.global_position = main.world.get_spawn()
	main.player.velocity = Vector3.ZERO
	main.player.yaw = 0.0
	game_started = true
	_begin_play()

func _continue_game() -> void:
	if not GameState.continue_game():
		GameState.message("No se encontró una partida guardada.")
		return
	main.player.global_position = GameState.saved_player_position if GameState.saved_player_position != Vector3.ZERO else main.world.get_spawn()
	game_started = true
	_begin_play()

func _begin_play() -> void:
	menu_panel.visible = false
	pause_panel.visible = false
	inventory_panel.visible = false
	map_panel.visible = false
	hud.visible = true
	blocks_gameplay = false
	GameState.game_active = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if DisplayServer.is_touchscreen_available() else Input.MOUSE_MODE_CAPTURED
	if music != null and not music.playing:
		music.play()
	GameState.message("Pulsa E para recoger recursos y clic para golpear.")

func _return_to_menu() -> void:
	if game_started:
		GameState.save_game()
	GameState.game_active = false
	GameState.dead = false
	game_started = false
	hud.visible = false
	menu_panel.visible = true
	pause_panel.visible = false
	inventory_panel.visible = false
	map_panel.visible = false
	death_panel.visible = false
	blocks_gameplay = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _respawn() -> void:
	death_panel.visible = false
	GameState.die_and_respawn()
	main.player.global_position = main.world.get_spawn()
	main.player.velocity = Vector3.ZERO
	_resume_game()

func show_death(reason: String) -> void:
	death_panel.visible = true
	blocks_gameplay = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	GameState.save_game()
	var title: Label = death_panel.find_child("DeathTitle", true, false)
	var detail: Label = death_panel.find_child("DeathDetail", true, false)
	if title != null: title.text = "Has caído"
	if detail != null: detail.text = "Causa: %s\nParte de tu equipo puede recuperarse donde caíste." % reason

func _close_other_panels(except_panel: Control) -> void:
	for panel in [menu_panel, pause_panel, inventory_panel, map_panel, death_panel]:
		if panel != except_panel:
			panel.visible = false

func refresh_stats() -> void:
	for key in bars.keys():
		var value := float(GameState.stats.get(key, 0.0))
		bars[key].value = value
		stat_labels[key].text = "%d" % roundi(value)

func refresh_inventory() -> void:
	if inventory_grid == null:
		return
	var slots := inventory_grid.get_children()
	for i in range(mini(slots.size(), GameState.inventory.size())):
		var button: Button = slots[i]
		var slot = GameState.inventory[i]
		button.icon = null
		button.text = "%d\n—" % (i + 1)
		button.tooltip_text = "Casilla vacía"
		if slot != null:
			var item_id := str(slot.id)
			var item: Dictionary = GameState.items.get(item_id, {})
			var name := str(item.get("nombre", item_id))
			button.text = "%d\n%s ×%d" % [i + 1, name, int(slot.count)]
			button.tooltip_text = "%s\n%s" % [name, item.get("descripcion", "")]
			var icon_path := "res://assets/icons/%s.webp" % item_id
			if ResourceLoader.exists(icon_path):
				button.icon = load(icon_path)
			button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
			button.expand_icon = true
		button.add_theme_stylebox_override("normal", _style(Color(0.18, 0.22, 0.16, 0.95) if i != GameState.selected_slot else Color(0.48, 0.42, 0.24, 0.98), 5))
	if inventory_panel != null:
		var capacity: Label = inventory_panel.find_child("Capacity", true, false)
		if capacity != null:
			capacity.text = "Carga %.1f kg · Volumen %.1f L" % [GameState.item_weight(), GameState.item_volume()]
	for i in range(hotbar_buttons.size()):
		var button := hotbar_buttons[i]
		var slot = GameState.inventory[i]
		button.icon = null
		button.text = str(i + 1)
		if slot != null:
			var item_id := str(slot.id)
			var item: Dictionary = GameState.items.get(item_id, {})
			button.text = "%d\n%s" % [i + 1, str(item.get("nombre", item_id)).left(9)]
			var icon_path := "res://assets/icons/%s.webp" % item_id
			if ResourceLoader.exists(icon_path): button.icon = load(icon_path)
		button.add_theme_stylebox_override("normal", _style(Color(0.42, 0.36, 0.2, 0.98) if i == GameState.selected_slot else Color(0.09, 0.12, 0.09, 0.94), 5))
	_build_recipes()

func _build_recipes() -> void:
	if recipe_list == null:
		return
	for child in recipe_list.get_children():
		child.queue_free()
	var at_fire: bool = main.world.is_near_fire(main.player.global_position)
	for key in GameState.known_recipes:
		var recipe := GameState.get_recipe(key)
		if recipe.is_empty():
			continue
		var item_id := str(recipe.id)
		var def: Dictionary = GameState.items.get(item_id, {})
		var costs: Array[String] = []
		for material in recipe.get("costo", {}).keys():
			costs.append("%s %d" % [GameState.items.get(material, {}).get("nombre", material), recipe.costo[material]])
		var row := HBoxContainer.new()
		row.custom_minimum_size.y = 50
		var icon := TextureRect.new()
		icon.custom_minimum_size = Vector2(42, 42)
		icon.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
		var icon_path := "res://assets/icons/%s.webp" % item_id
		if ResourceLoader.exists(icon_path): icon.texture = load(icon_path)
		row.add_child(icon)
		var button := Button.new()
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.text = "%s\n%s" % [def.get("nombre", item_id), ", ".join(costs)]
		button.tooltip_text = def.get("descripcion", "")
		button.disabled = not GameState.can_craft(recipe, at_fire)
		button.pressed.connect(func():
			if GameState.craft(key, at_fire):
				GameState.message("Fabricas %s." % def.get("nombre", item_id))
			else:
				GameState.message("Te faltan materiales o una estación.")
			refresh_inventory()
		)
		row.add_child(button)
		recipe_list.add_child(row)
	if recipe_list.get_child_count() == 0:
		var empty := Label.new()
		empty.text = "Aún no conoces recetas. Reúne recursos para descubrirlas."
		empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		recipe_list.add_child(empty)

func _select_slot(index: int) -> void:
	GameState.selected_slot = clampi(index, 0, GameState.SLOT_COUNT - 1)
	GameState.inventory_changed.emit()

func _set_message(text: String) -> void:
	if message_label != null:
		message_label.text = text

func _stat_color(key: String) -> Color:
	match key:
		"vida": return Color(0.68, 0.19, 0.16)
		"hambre": return Color(0.72, 0.48, 0.18)
		"sed": return Color(0.17, 0.48, 0.68)
		"energia": return Color(0.71, 0.67, 0.26)
		"oxigeno": return Color(0.32, 0.66, 0.76)
		"mojado": return Color(0.39, 0.59, 0.75)
		_: return Color(0.52, 0.39, 0.7)

func _panel_at_center(panel_size: Vector2) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.position = -panel_size * 0.5
	panel.size = panel_size
	panel.add_theme_stylebox_override("panel", _style(Color(0.055, 0.07, 0.055, 0.96), 14))
	panel.add_theme_constant_override("margin_left", 22)
	panel.add_theme_constant_override("margin_right", 22)
	panel.add_theme_constant_override("margin_top", 20)
	panel.add_theme_constant_override("margin_bottom", 20)
	return panel

func _button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 46)
	button.add_theme_font_size_override("font_size", 18)
	button.add_theme_stylebox_override("normal", _style(Color(0.19, 0.25, 0.17, 1.0), 6))
	button.add_theme_stylebox_override("hover", _style(Color(0.3, 0.38, 0.22, 1.0), 6))
	button.add_theme_stylebox_override("pressed", _style(Color(0.12, 0.18, 0.12, 1.0), 6))
	return button

func _style(color: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	style.content_margin_left = 8.0
	style.content_margin_right = 8.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	return style
