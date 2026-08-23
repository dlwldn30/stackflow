package com.stackflow.backend.service;

import com.stackflow.backend.dto.ProjectFolderSelectionResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

@Service
public class LocalProjectFolderPickerService {

	private static final String CANCELLED_MARKER = "__STACKFLOW_CANCELLED__";
	private static final String MACOS_FOLDER_SCRIPT = """
		try
			set selectedFolder to choose folder with prompt "StackFlow에서 분석할 Spring 프로젝트를 선택하세요"
			return POSIX path of selectedFolder
		on error number -128
			return "__STACKFLOW_CANCELLED__"
		end try
		""";

	private final String osName;
	private final CommandRunner commandRunner;

	public LocalProjectFolderPickerService() {
		this(System.getProperty("os.name", ""), LocalProjectFolderPickerService::runCommand);
	}

	LocalProjectFolderPickerService(String osName, CommandRunner commandRunner) {
		this.osName = osName;
		this.commandRunner = commandRunner;
	}

	public ProjectFolderSelectionResponse selectProjectFolder() {
		if (!osName.toLowerCase(Locale.ROOT).contains("mac")) {
			return new ProjectFolderSelectionResponse(
				false,
				false,
				null,
				"현재 폴더 선택창은 macOS에서 지원합니다. 프로젝트 절대 경로를 직접 입력하세요."
			);
		}

		try {
			CommandResult result = commandRunner.run(List.of("/usr/bin/osascript", "-e", MACOS_FOLDER_SCRIPT));
			String output = result.output().trim();
			if (result.exitCode() != 0) {
				throw new IllegalStateException("폴더 선택창을 열지 못했습니다: " + output);
			}
			if (output.isEmpty() || CANCELLED_MARKER.equals(output)) {
				return new ProjectFolderSelectionResponse(true, false, null, "폴더 선택을 취소했습니다.");
			}

			Path selectedPath = Path.of(output).toAbsolutePath().normalize();
			if (!Files.isDirectory(selectedPath)) {
				throw new IllegalStateException("선택한 경로가 폴더가 아닙니다.");
			}

			return new ProjectFolderSelectionResponse(
				true,
				true,
				selectedPath.toString(),
				"프로젝트 폴더를 선택했습니다."
			);
		} catch (IOException exception) {
			throw new IllegalStateException("폴더 선택창을 실행하지 못했습니다.", exception);
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("폴더 선택이 중단되었습니다.", exception);
		}
	}

	private static CommandResult runCommand(List<String> command) throws IOException, InterruptedException {
		Process process = new ProcessBuilder(command)
			.redirectErrorStream(true)
			.start();
		String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
		return new CommandResult(process.waitFor(), output);
	}

	@FunctionalInterface
	interface CommandRunner {
		CommandResult run(List<String> command) throws IOException, InterruptedException;
	}

	record CommandResult(int exitCode, String output) {
	}
}
