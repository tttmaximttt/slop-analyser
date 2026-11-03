# Records docs/demo.gif: slop-report on a real session of this repo, with local paths redacted.
# Regenerate from the repo root with `vhs docs/demo.tape` (needs that session in ~/.claude/projects;
# change DEMO_SESSION to one of your own sessions of this repo otherwise).

Output docs/demo.gif

Set Shell "bash"
Set Theme "Catppuccin Mocha"
Set FontSize 16
Set Width 1440
Set Height 900
Set Padding 24
Set TypingSpeed 60ms

Env DEMO_SESSION "7f2b1f08-bc36-40cf-ac3c-ce009098b3e5"
Env DEMO_DIR "/tmp/slop-demo"

Hide
Type "sh docs/demo-setup.sh && export PATH=$PWD/bin:$PATH PS1='$ ' && cd /tmp/slop-demo && clear"
Enter
Sleep 1s
Show

Type "slop-report session.jsonl --top 3"
Sleep 500ms
Enter
Sleep 20s
