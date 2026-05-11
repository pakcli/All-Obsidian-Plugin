# Tree Diagram
This is an Obsidian plugin that converts tab-indented text to a tree diagram.

## Example
Input:
~~~
```tree
/
	home
	boot
	var
		log
	usr
		local
			bin
			sbin
			lib
		bin
			cat
		sbin
	etc
```
~~~

Output:
```
/
├── home
├── boot
├── var
│   └── log
├── usr
│   ├── local
│   │   ├── bin
│   │   ├── sbin
│   │   └── lib
│   ├── bin
│   │   └── cat
│   └── sbin
└── etc
```

## Installation
### Install via Obsidian
1. Go to Obsidian Settings -> Community Plugins
2. Click on "Browse" and search for "Tree Diagram"
3. Install and enable the plugin
### Install via GitHub
1. Go to [Latest Release](https://github.com/limpido/obsidian-tree-diagram/releases/latest)
2. Download the source code archive and extract to `<vault>/.obsidian/plugins/`
3. Reload Obsidian
4. Go to Settings -> Community Plugins -> Installed Plugins, enable the plugin
