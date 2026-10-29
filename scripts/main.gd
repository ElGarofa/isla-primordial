class_name IslaMain
extends Node3D

const WORLD_SCRIPT := preload("res://scripts/island_world.gd")
const PLAYER_SCRIPT := preload("res://scripts/player.gd")
const UI_SCRIPT := preload("res://scripts/game_ui.gd")

var world: IslaIslandWorld
var player: IslaPlayer
var game_ui: IslaGameUI
var autosave_timer := 0.0

func _ready() -> void:
	_ensure_input_actions()
	world = WORLD_SCRIPT.new()
	world.name = "IslandWorld"
	add_child(world)
	player = PLAYER_SCRIPT.new()
	player.name = "Player"
	player.configure(world)
	player.position = world.get_spawn()
	add_child(player)
	world.set_player(player)
	game_ui = UI_SCRIPT.new()
	game_ui.configure(self)
	add_child(game_ui)
	player.current_ui = game_ui

func _process(delta: float) -> void:
	if GameState.game_active:
		autosave_timer += delta
		if autosave_timer >= 60.0:
			autosave_timer = 0.0
			GameState.save_game()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_PREDELETE:
		if GameState.game_active:
			GameState.save_game()

func _ensure_input_actions() -> void:
	_add_key_action("move_forward", KEY_W)
	_add_key_action("move_back", KEY_S)
	_add_key_action("move_left", KEY_A)
	_add_key_action("move_right", KEY_D)
	_add_key_action("sprint", KEY_SHIFT)
	_add_key_action("crouch", KEY_CTRL)
	_add_key_action("jump", KEY_SPACE)

func _add_key_action(action: String, key: Key) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	var event := InputEventKey.new()
	event.physical_keycode = key
	if not InputMap.action_has_event(action, event):
		InputMap.action_add_event(action, event)
