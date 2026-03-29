from tkinter import *
from tkinter import filedialog

# Create main window
root = Tk()
root.title("Simple Text Editor")
root.geometry("600x400")

# ------------------ Functions ------------------

def new_file():
    text_area.delete(1.0, END)

def exit_app():
    root.quit()

def open_file():
    file = filedialog.askopenfilename()
    if file:
        with open(file, "r") as f:
            content = f.read()
            text_area.delete(1.0, END)
            text_area.insert(END, content)

def save_file():
    file = filedialog.asksaveasfilename(defaultextension=".txt")
    if file:
        with open(file, "w") as f:
            f.write(text_area.get(1.0, END))

# ------------------ Menu ------------------

menu_bar = Menu(root)
file_menu = Menu(menu_bar, tearoff=0)

file_menu.add_command(label="New", command=new_file)
file_menu.add_separator()
file_menu.add_command(label="Exit", command=exit_app)

menu_bar.add_cascade(label="File", menu=file_menu)
root.config(menu=menu_bar)

# ------------------ Toolbar ------------------

toolbar = Frame(root, bd=1, relief=RAISED)

open_btn = Button(toolbar, text="Open", command=open_file)
open_btn.pack(side=LEFT, padx=2, pady=2)

save_btn = Button(toolbar, text="Save", command=save_file)
save_btn.pack(side=LEFT, padx=2, pady=2)

toolbar.pack(side=TOP, fill=X)

# ------------------ Text Area ------------------

text_area = Text(root, wrap=WORD)
text_area.pack(expand=1, fill=BOTH)

root.mainloop()