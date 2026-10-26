# Processes and Threads

A process is a program in execution with its own address space. A process moves between the states new, ready, running, waiting and terminated. The process control block (PCB) stores the process state, program counter, CPU registers and memory-management information. A context switch saves the PCB of the running process and loads the PCB of the next one; it is pure overhead because no useful work is done during it.

Threads share the code, data and open files of their process but each thread has its own stack and registers. Creating a thread is cheaper than creating a process.

# CPU Scheduling

First-Come First-Served (FCFS) runs processes in arrival order and suffers from the convoy effect, where short jobs wait behind a long one. Shortest Job First (SJF) minimises average waiting time but can starve long jobs. Round Robin gives each process a fixed time quantum; if the quantum is too large it behaves like FCFS, if too small the context-switch overhead dominates.

Turnaround time = completion time − arrival time. Waiting time = turnaround time − burst time.

# Synchronization and Deadlocks

A critical section is code that accesses shared data and must not run in more than one process at a time. A semaphore is an integer variable accessed only through wait() and signal(). A mutex is a binary lock owned by the thread that locked it.

Deadlock requires four conditions at once: mutual exclusion, hold and wait, no preemption, and circular wait. Preventing any one condition prevents deadlock. Banker's algorithm avoids deadlock by granting a request only if the system stays in a safe state, meaning some order exists in which every process can finish.

# Memory Management

Paging divides logical memory into fixed-size pages and physical memory into frames of the same size, removing external fragmentation but allowing internal fragmentation in the last page. Segmentation divides memory into variable-size logical units such as code and stack.

Virtual memory lets a process run when only part of it is in RAM. A page fault occurs when a referenced page is not in memory. FIFO page replacement evicts the oldest page and can show Belady's anomaly, where more frames cause more faults. LRU evicts the page unused for the longest time and does not suffer from Belady's anomaly. Thrashing happens when a process spends more time paging than executing.
