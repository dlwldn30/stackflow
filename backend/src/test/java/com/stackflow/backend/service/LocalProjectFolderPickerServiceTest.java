package com.stackflow.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.stackflow.backend.dto.ProjectFolderSelectionResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalProjectFolderPickerServiceTest {

	@TempDir
	Path tempDir;

	@Test
	void returnsSelectedMacOsFolderAsAnAbsolutePath() {
		LocalProjectFolderPickerService service = new LocalProjectFolderPickerService(
			"Mac OS X",
			command -> new LocalProjectFolderPickerService.CommandResult(0, tempDir + "/\n")
		);

		ProjectFolderSelectionResponse response = service.selectProjectFolder();

		assertThat(response.supported()).isTrue();
		assertThat(response.selected()).isTrue();
		assertThat(response.projectPath()).isEqualTo(tempDir.toAbsolutePath().normalize().toString());
	}

	@Test
	void reportsCancellationWithoutSelectingAPath() {
		LocalProjectFolderPickerService service = new LocalProjectFolderPickerService(
			"Mac OS X",
			command -> new LocalProjectFolderPickerService.CommandResult(0, "__STACKFLOW_CANCELLED__\n")
		);

		ProjectFolderSelectionResponse response = service.selectProjectFolder();

		assertThat(response.supported()).isTrue();
		assertThat(response.selected()).isFalse();
		assertThat(response.projectPath()).isNull();
	}

	@Test
	void keepsDirectInputAvailableOnUnsupportedOperatingSystems() {
		LocalProjectFolderPickerService service = new LocalProjectFolderPickerService(
			"Linux",
			command -> new LocalProjectFolderPickerService.CommandResult(0, tempDir.toString())
		);

		ProjectFolderSelectionResponse response = service.selectProjectFolder();

		assertThat(response.supported()).isFalse();
		assertThat(response.selected()).isFalse();
	}

	@Test
	void rejectsASelectionThatIsNotADirectory() throws Exception {
		Path file = Files.createFile(tempDir.resolve("build.gradle"));
		LocalProjectFolderPickerService service = new LocalProjectFolderPickerService(
			"Mac OS X",
			command -> new LocalProjectFolderPickerService.CommandResult(0, file.toString())
		);

		assertThatThrownBy(service::selectProjectFolder)
			.isInstanceOf(IllegalStateException.class)
			.hasMessage("선택한 경로가 폴더가 아닙니다.");
	}
}
