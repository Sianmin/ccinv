Output assets/demo.gif

Set FontSize 14
Set Width 1100
Set Height 720
Set Padding 20
Set Theme "GitHub Dark"
Set TypingSpeed 50ms
Set Shell "zsh"

Hide
Type "export PATH=/opt/homebrew/bin:$PATH"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 200ms
Show

Type "ccinv"
Enter
Sleep 5s

Type "clear"
Enter
Sleep 300ms

Type "ccinv --no-plugins"
Enter
Sleep 4s

Type "clear"
Enter
Sleep 300ms

Type "ccinv --json | jq '.totals'"
Enter
Sleep 3s
